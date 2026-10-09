import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, resolve, sep } from "node:path";
import { Actions } from "./src/actions";
import * as schema from "./src/schema";

const rootDir = resolve(import.meta.dir, "..");
const clientDistDir = join(rootDir, "client", "dist");
const dbPath = process.env.DATABASE_PATH
  ? resolve(process.env.DATABASE_PATH)
  : join(rootDir, "data", "urbanservice.db");

if (dbPath !== ":memory:") mkdirSync(dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath, { create: true });
sqlite.exec("PRAGMA journal_mode = WAL;");
sqlite.exec("PRAGMA foreign_keys = ON;");

function runMigrations() {
  const drizzleDir = join(rootDir, "drizzle");
  const files = readdirSync(drizzleDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const sql = readFileSync(join(drizzleDir, file), "utf8");
    const statements = sql
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter(Boolean);

    for (const statement of statements) {
      try {
        sqlite.exec(statement);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // Migrations are replayed on every boot so a fresh Render instance and a
        // reused local database take the same path. SQLite has no ADD COLUMN
        // IF NOT EXISTS, so duplicate-column / table-exists errors are expected
        // after the first successful boot.
        if (/duplicate column name|already exists/i.test(message)) continue;
        throw new Error(`Migration ${file} failed: ${message}`);
      }
    }
  }
}

runMigrations();

const db = drizzle(sqlite, { schema });

const unavailable = (name: string) => async () => {
  throw new Error(`${name} is not available in the standalone Render deployment`);
};

const ctx = {
  slug: "urbanservice-web-app",
  invocationId: "standalone",
  spaceDir: rootDir,
  db: () => db,
  blobs: {
    put: unavailable("Blob storage"),
    getUrl: unavailable("Blob storage"),
    delete: unavailable("Blob storage"),
    head: async () => null,
    list: async () => [],
  },
  agent: {
    spawnTask: unavailable("Agent tasks"),
    send: unavailable("Agent tasks"),
    status: unavailable("Agent tasks"),
  },
  inference: { complete: unavailable("Inference") },
  tool: {},
  emit: () => {},
  invalidateQueries: () => {},
  executePrivileged: unavailable("Privileged actions"),
} as const;

const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

async function handleAction(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: { code: "bad_json", message: "Request body must be JSON" }, retrySafe: true }, 400);
  }

  const actionName = typeof body === "object" && body !== null && "action" in body
    ? String((body as { action?: unknown }).action ?? "")
    : "";
  const args = typeof body === "object" && body !== null && "args" in body
    ? (body as { args?: unknown }).args ?? {}
    : {};

  const action = (Actions as Record<string, any>)[actionName];
  if (!action || typeof action.handler !== "function") {
    return json({ error: { code: "action_not_found", message: `Unknown action: ${actionName}` }, retrySafe: true }, 404);
  }

  try {
    const parsedArgs = action.request.parse(args);
    const result = action.response ? action.response.parse(await action.handler(ctx, parsedArgs)) : await action.handler(ctx, parsedArgs);
    return json({ data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isValidationError = typeof error === "object" && error !== null && "issues" in error;
    console.error(`[action ${actionName}]`, error);
    return json(
      {
        error: {
          code: isValidationError ? "validation_error" : "action_error",
          message,
          ...(isValidationError ? { issues: (error as { issues: unknown }).issues } : {}),
        },
        retrySafe: false,
      },
      isValidationError ? 400 : 500,
    );
  }
}

function safeStaticPath(pathname: string) {
  const decoded = decodeURIComponent(pathname);
  const requested = decoded === "/" ? "/index.html" : decoded;
  const filePath = resolve(clientDistDir, `.${requested}`);
  return filePath === clientDistDir || filePath.startsWith(clientDistDir + sep) ? filePath : null;
}

async function serveStatic(pathname: string) {
  if (!existsSync(clientDistDir)) {
    return new Response("Client build not found. Run `bun run build` first.", { status: 503 });
  }

  const filePath = safeStaticPath(pathname);
  if (!filePath) return new Response("Not found", { status: 404 });

  const file = Bun.file(filePath);
  if (await file.exists()) {
    const ext = extname(filePath).toLowerCase();
    return new Response(file, {
      headers: {
        "content-type": contentTypes[ext] ?? "application/octet-stream",
        "cache-control": ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
      },
    });
  }

  // SPA fallback for app routes; missing asset-like paths stay 404 so broken
  // images/scripts do not silently return HTML.
  if (extname(pathname)) return new Response("Not found", { status: 404 });
  const index = Bun.file(join(clientDistDir, "index.html"));
  return new Response(index, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" } });
}

const port = Number(process.env.PORT ?? 3000);

Bun.serve({
  hostname: "0.0.0.0",
  port,
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/healthz") {
      return json({ ok: true, service: "urbanservice-web-app" });
    }

    if (request.method === "POST" && (url.pathname === "/actions" || url.pathname === "/client/dist/actions")) {
      return handleAction(request);
    }

    if (request.method === "GET" || request.method === "HEAD") {
      return serveStatic(url.pathname);
    }

    return new Response("Method not allowed", { status: 405 });
  },
});

console.log(`UrbanService standalone server listening on port ${port}`);
