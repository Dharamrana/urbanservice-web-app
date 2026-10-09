import { z } from "zod";

export { z };

export const ACTION_BRAND = "@hatch/space-sdk/action/v1";
export const PRIVILEGED_CONTRACT_BRAND = "@hatch/space-sdk/privileged-contract/v1";
export const PRIVILEGED_HANDLERS_FORMAT = "hatch-space-privileged-handlers-v1";
export const INFERENCE_SCHEMA_ERROR_BRAND = "@hatch/space-sdk/InferenceSchemaError/v1";

export class InferenceSchemaError extends Error {
  constructor(issues) {
    super("Inference output did not match the requested schema");
    this.name = "InferenceSchemaError";
    this.__brand = INFERENCE_SCHEMA_ERROR_BRAND;
    this.issues = issues;
  }

  static is(value) {
    return value instanceof InferenceSchemaError ||
      (typeof value === "object" && value !== null && value.__brand === INFERENCE_SCHEMA_ERROR_BRAND);
  }
}

export function defineAction(spec) {
  if (!spec || typeof spec.handler !== "function") {
    throw new Error("defineAction requires a handler");
  }
  return {
    __brand: ACTION_BRAND,
    request: spec.request,
    response: spec.response,
    ...(spec.privileged !== undefined ? { privileged: spec.privileged } : {}),
    handler: spec.handler,
  };
}

export function createDefineAction() {
  return defineAction;
}

export function isAction(value) {
  return typeof value === "object" && value !== null &&
    value.__brand === ACTION_BRAND && typeof value.handler === "function";
}

export function definePrivilegedContracts(specs) {
  const contracts = {};
  for (const [name, spec] of Object.entries(specs)) {
    contracts[name] = {
      __brand: PRIVILEGED_CONTRACT_BRAND,
      name,
      request: spec.request,
      response: spec.response,
      ...(spec.capabilities !== undefined ? { capabilities: spec.capabilities } : {}),
      ...(spec.timeoutMs !== undefined ? { timeoutMs: spec.timeoutMs } : {}),
    };
  }
  return contracts;
}

export function definePrivilegedHandlers(contracts, handlers) {
  const entries = [];
  for (const [key, handler] of Object.entries(handlers)) {
    if (handler === undefined) continue;
    const contract = contracts[key];
    if (!isPrivilegedContract(contract)) {
      throw new Error(`privileged handler '${key}' does not have a contract descriptor`);
    }
    entries.push({ contract, handler });
  }
  return { format: PRIVILEGED_HANDLERS_FORMAT, entries };
}

export function isPrivilegedContract(value) {
  return typeof value === "object" && value !== null && value.__brand === PRIVILEGED_CONTRACT_BRAND;
}

export function isPrivilegedHandlers(value) {
  return typeof value === "object" && value !== null &&
    value.format === PRIVILEGED_HANDLERS_FORMAT && Array.isArray(value.entries);
}

export function createPrivilegedExecutor(declared, transport) {
  const declaredNames = new Set((declared ?? []).map((contract) => contract.name));
  return {
    async executePrivileged(contract, args) {
      if (!isPrivilegedContract(contract)) {
        throw new Error("ctx.executePrivileged requires a privileged contract descriptor");
      }
      if (!declaredNames.has(contract.name)) {
        throw new Error(`ctx.executePrivileged(${contract.name}) was not declared by this action`);
      }
      if (typeof transport !== "function") {
        throw new Error("Privileged actions are not available in standalone mode");
      }
      const parsedArgs = contract.request.parse(args);
      const result = await transport(contract, parsedArgs);
      return contract.response.parse(result);
    },
  };
}
