// Request comparison uses binding names/pointers, never a verifier of supplied secret values.
import type { FluxNodeRunRequest } from "@fluxiq/contracts/fluxnode";
import type { JsonValue } from "../../../../../core/index.ts";

export type FluxNodeRequestIdentity = { projection: JsonValue };

export function fluxNodeRequestIdentity(request: FluxNodeRunRequest, secretPointers: readonly string[]): FluxNodeRequestIdentity {
  const plain = JSON.parse(JSON.stringify(request)) as JsonValue;
  const bindings = new Set(secretPointers);
  const at = (parent: string, key: string | number): string => `${parent}/${String(key).replace(/~/gu, "~0").replace(/\//gu, "~1")}`;
  const walk = (value: JsonValue, pointer: string): JsonValue => {
    if (bindings.has(pointer)) return { secretBinding: pointer };
    if (Array.isArray(value)) return value.map((item, index) => walk(item, at(pointer, index)));
    if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, walk(item, at(pointer, key))]));
    return value;
  };
  return { projection: walk(plain, "") };
}
