import type { CSSProperties, HTMLAttributes } from "react";
import { QueryClient } from "@tanstack/react-query";
import type { z, ZodType } from "zod";

export declare class SpaceActionError extends Error {
  readonly status: number;
  readonly retryAfterMs?: number | undefined;
  readonly retrySafe: boolean;
  constructor(message: string, status: number, retryAfterMs?: number, retrySafe?: boolean);
}

export declare const PERMANENT_ACTION_STATUSES: Set<number>;
export declare const MAX_ACTION_RETRIES = 3;
export declare function shouldRetryAction(failureCount: number, error: unknown): boolean;
export declare function actionRetryDelay(failureCount: number, error: unknown): number;
export declare const spaceQueryClient: QueryClient;
export declare function installAuditSettleProbe(queryClient?: QueryClient): void;
export declare function installSpaceQueryInvalidationListener(queryClient?: QueryClient): void;

export type SafeAreaTopScrimVariant = "gradient" | "blur" | "solid";
export interface SafeAreaTopScrimProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  variant?: SafeAreaTopScrimVariant;
  backgroundColor?: CSSProperties["backgroundColor"];
  zIndex?: CSSProperties["zIndex"];
}
export declare function SafeAreaTopScrim(props: SafeAreaTopScrimProps): JSX.Element;

export declare function bytesToBase64(bytes: Uint8Array): string;
export declare function fileToBase64(file: Blob): Promise<string>;

export type ActionRequest<A extends { request: ZodType }> = z.infer<A["request"]>;
export type ActionResponse<A extends { response: ZodType }> = z.infer<A["response"]>;
export type ApiRequest<C extends Record<string, (args: never) => Promise<unknown>>, K extends keyof C> = Parameters<C[K]>[0];
export type ApiResponse<C extends Record<string, (args: never) => Promise<unknown>>, K extends keyof C> = Awaited<ReturnType<C[K]>>;

type ClientActionShape = {
  request: ZodType;
  response: ZodType;
};

export type ActionClient<A extends Record<string, ClientActionShape>> = {
  [K in keyof A]: (args: ActionRequest<A[K]>) => Promise<ActionResponse<A[K]>>;
};

interface ClientOptions {
  endpoint?: string;
  fetch?: typeof globalThis.fetch;
}

export declare function createActionClient<A extends Record<string, ClientActionShape>>(options?: ClientOptions): ActionClient<A>;
