import { z } from "zod";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";

export { z };

export declare const ACTION_BRAND: "@hatch/space-sdk/action/v1";
export declare const PRIVILEGED_CONTRACT_BRAND: "@hatch/space-sdk/privileged-contract/v1";
export declare const PRIVILEGED_HANDLERS_FORMAT: "hatch-space-privileged-handlers-v1";
export declare const INFERENCE_SCHEMA_ERROR_BRAND: "@hatch/space-sdk/InferenceSchemaError/v1";

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type SpaceDb<TSchema extends Record<string, unknown> = Record<string, never>> = Pick<BunSQLiteDatabase<TSchema>, "select" | "insert" | "update" | "delete" | "run" | "all" | "get" | "batch">;
export type SpaceDbAccessor = <TSchema extends Record<string, unknown> = Record<string, never>>() => SpaceDb<TSchema>;
export type Viewer = unknown;

export interface BlobMetadata {
  readonly key: string;
  readonly contentType: string;
  readonly size: number;
  readonly sizeBytes: number;
  readonly etag: string;
  readonly visibility: "private" | "public";
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
  readonly public: boolean;
}

export interface BlobClient {
  put(key: string, data: unknown, options?: { contentType?: string; public?: boolean }): Promise<void>;
  getUrl(key: string, options?: { expiresInSeconds?: number; public?: boolean }): Promise<string>;
  delete(key: string): Promise<void>;
  head(key: string): Promise<BlobMetadata | null>;
  list(prefix?: string): Promise<BlobMetadata[]>;
}

export interface PortableCtx {
  readonly slug: string;
  readonly invocationId: string;
  readonly spaceDir: string;
  readonly db: SpaceDbAccessor;
  readonly viewer?: Viewer;
  readonly blobs: BlobClient;
  executePrivileged(contract: unknown, args: unknown): Promise<unknown>;
}

export interface Ctx extends PortableCtx {
  readonly agent: any;
  readonly inference: any;
  readonly tool: any;
  emit(data: JsonValue): void;
  invalidateQueries(invalidation?: unknown): void;
}

export interface ActionDefinition<Req extends z.ZodType = z.ZodType, Res extends z.ZodType = z.ZodType> {
  readonly __brand: typeof ACTION_BRAND;
  readonly request: Req;
  readonly response: Res;
  readonly privileged?: readonly unknown[];
  readonly handler: (ctx: Ctx, args: z.infer<Req>) => Promise<z.infer<Res>>;
}

export type ActionFactoryInput<Req extends z.ZodType = z.ZodType, Res extends z.ZodType = z.ZodType> = {
  request: Req;
  response: Res;
  privileged?: readonly unknown[];
  handler: (ctx: Ctx, args: z.infer<Req>) => Promise<z.infer<Res>>;
};

export declare const defineAction: <Req extends z.ZodType, Res extends z.ZodType>(spec: ActionFactoryInput<Req, Res>) => ActionDefinition<Req, Res>;
export declare function createDefineAction<TCtx = Ctx>(): typeof defineAction;
export declare function isAction(value: unknown): value is ActionDefinition;
export type ActionsModule = Record<string, Omit<ActionDefinition, "handler"> & { handler: (ctx: Ctx, args: any) => Promise<any> }>;
export type ActionsModuleFor<TCtx> = ActionsModule;
export type ActionRequest<A extends { request: z.ZodType }> = z.infer<A["request"]>;
export type ActionResponse<A extends { response: z.ZodType }> = z.infer<A["response"]>;

export interface PrivilegedContract<Name extends string = string, Req extends z.ZodType = z.ZodType, Res extends z.ZodType = z.ZodType> {
  readonly __brand: typeof PRIVILEGED_CONTRACT_BRAND;
  readonly name: Name;
  readonly request: Req;
  readonly response: Res;
  readonly capabilities?: readonly string[];
  readonly timeoutMs?: number;
}
export type PrivilegedContractSpec<Req extends z.ZodType = z.ZodType, Res extends z.ZodType = z.ZodType> = {
  readonly request: Req;
  readonly response: Res;
  readonly capabilities?: readonly string[];
  readonly timeoutMs?: number;
};
export type PrivilegedContractsFor<Specs extends Record<string, PrivilegedContractSpec>> = {
  readonly [Name in keyof Specs & string]: PrivilegedContract<Name, Specs[Name]["request"], Specs[Name]["response"]>;
};
export type PrivilegedRequest<C extends PrivilegedContract> = z.infer<C["request"]>;
export type PrivilegedResponse<C extends PrivilegedContract> = z.infer<C["response"]>;
export interface PrivilegedExecutor {
  executePrivileged<C extends PrivilegedContract>(contract: C, args: PrivilegedRequest<C>): Promise<PrivilegedResponse<C>>;
}
export type PrivilegedTransport = <C extends PrivilegedContract>(contract: C, args: PrivilegedRequest<C>) => Promise<unknown>;
export type PrivilegedHandler<C extends PrivilegedContract = PrivilegedContract> = (args: PrivilegedRequest<C>) => Promise<PrivilegedResponse<C>> | PrivilegedResponse<C>;
export type PrivilegedHandlersFor<Contracts extends Record<string, PrivilegedContract>> = {
  readonly [Name in keyof Contracts]?: PrivilegedHandler<Contracts[Name]>;
};
export interface PrivilegedHandlerEntry<C extends PrivilegedContract = PrivilegedContract> {
  readonly contract: C;
  readonly handler: PrivilegedHandler<C>;
}
export interface PrivilegedHandlers {
  readonly format: typeof PRIVILEGED_HANDLERS_FORMAT;
  readonly entries: readonly PrivilegedHandlerEntry[];
}
export declare function definePrivilegedContracts<const Specs extends Record<string, PrivilegedContractSpec>>(specs: Specs): PrivilegedContractsFor<Specs>;
export declare function definePrivilegedHandlers<const Contracts extends Record<string, PrivilegedContract>>(contracts: Contracts, handlers: PrivilegedHandlersFor<Contracts>): PrivilegedHandlers;
export declare function isPrivilegedContract(value: unknown): value is PrivilegedContract;
export declare function isPrivilegedHandlers(value: unknown): value is PrivilegedHandlers;
export declare function createPrivilegedExecutor(declared: readonly PrivilegedContract[] | undefined, transport: PrivilegedTransport): PrivilegedExecutor;

export declare class InferenceSchemaError extends Error {
  readonly __brand: typeof INFERENCE_SCHEMA_ERROR_BRAND;
  readonly issues: readonly z.core.$ZodIssue[];
  constructor(issues: readonly z.core.$ZodIssue[]);
  static is(value: unknown): value is InferenceSchemaError;
}
