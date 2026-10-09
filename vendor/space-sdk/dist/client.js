import "../styles.css";
import { QueryClient } from "@tanstack/react-query";
import { createElement } from "react";

export class SpaceActionError extends Error {
  constructor(message, status, retryAfterMs, retrySafe = false) {
    super(message);
    this.name = "SpaceActionError";
    this.status = status;
    this.retryAfterMs = retryAfterMs;
    this.retrySafe = retrySafe;
  }
}

export const PERMANENT_ACTION_STATUSES = new Set([400, 401, 403, 404, 409, 413, 415, 422]);
export const MAX_ACTION_RETRIES = 3;

export function shouldRetryAction(failureCount, error) {
  return error instanceof SpaceActionError && error.retrySafe && failureCount < MAX_ACTION_RETRIES;
}

export function actionRetryDelay(failureCount, error) {
  const floor = error instanceof SpaceActionError && error.retryAfterMs != null ? error.retryAfterMs : 0;
  const ceiling = Math.min(30_000, 1_000 * 2 ** failureCount);
  return floor + Math.random() * ceiling;
}

export const spaceQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetryAction,
      retryDelay: actionRetryDelay,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

export function installAuditSettleProbe(queryClient = spaceQueryClient) {
  if (typeof window === "undefined") return;
  window.__hatchAuditSettle = () => queryClient.isFetching() + queryClient.isMutating();
}

if (typeof window !== "undefined") installAuditSettleProbe();

export function installSpaceQueryInvalidationListener() {
  // The standalone server has no host bridge; React Query mutations invalidate locally.
}

const TOP_SAFE_AREA_MASK = "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%)";

export function SafeAreaTopScrim({ variant = "gradient", backgroundColor, zIndex = 40, className, style, ...props }) {
  const inset = "var(--twsa-safe-area-inset-top, env(safe-area-inset-top, 0px))";
  const managedStyle = {
    ...style,
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    zIndex,
    pointerEvents: "none",
    height: variant === "gradient" ? `calc(${inset} + min(2rem, ${inset}))` : inset,
    backgroundColor: backgroundColor ?? style?.backgroundColor ?? "var(--bg)",
  };
  if (variant === "gradient") {
    managedStyle.maskImage = TOP_SAFE_AREA_MASK;
    managedStyle.WebkitMaskImage = TOP_SAFE_AREA_MASK;
  } else if (variant === "blur") {
    managedStyle.backdropFilter = style?.backdropFilter ?? "blur(12px)";
    managedStyle.WebkitBackdropFilter = style?.WebkitBackdropFilter ?? "blur(12px)";
  }
  return createElement("div", {
    ...props,
    "aria-hidden": props["aria-hidden"] ?? true,
    className,
    style: managedStyle,
  });
}

export function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export async function fileToBase64(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return bytesToBase64(bytes);
}

function resolveEndpoint(relative) {
  if (typeof location === "undefined") return relative;
  const base = new URL(location.href);
  base.hash = "";
  base.search = "";
  return new URL(relative, base).toString();
}

function parseRetryAfterMs(response) {
  const raw = response.headers.get("retry-after");
  if (!raw) return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const dateMs = Date.parse(raw);
  return Number.isFinite(dateMs) ? Math.max(0, dateMs - Date.now()) : undefined;
}

function createActionCallId() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `space-action-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function createActionClient(options = {}) {
  const endpoint = options.endpoint ?? resolveEndpoint("./actions");
  const fetchImpl = options.fetch ?? globalThis.fetch;

  return new Proxy({}, {
    get(_target, name) {
      if (typeof name !== "string") return undefined;
      if (name === "then" || name === "catch" || name === "finally") return undefined;
      return async (args) => {
        const actionCallId = createActionCallId();
        const response = await fetchImpl(endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-request-id": actionCallId,
          },
          body: JSON.stringify({ action: name, args: args ?? {}, actionCallId }),
        });

        const text = await response.text();
        let body = null;
        if (text) {
          try { body = JSON.parse(text); } catch { body = text; }
        }

        if (!response.ok) {
          const retryAfterMs = parseRetryAfterMs(response);
          const retrySafe = typeof body === "object" && body !== null && body.retrySafe === true;
          const detail = typeof body === "string" ? body : JSON.stringify(body ?? null);
          throw new SpaceActionError(`action ${name} failed: ${response.status} ${detail}`, response.status, retryAfterMs, retrySafe);
        }

        if (body && typeof body === "object" && "error" in body && body.error && !("data" in body)) {
          throw new Error(`action ${name} error: ${String(body.error)}`);
        }
        return body?.data;
      };
    },
  });
}
