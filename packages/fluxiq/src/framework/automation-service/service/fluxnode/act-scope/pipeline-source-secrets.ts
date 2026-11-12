import type { JsonObject, JsonValue } from "../../../../../core/index.ts";

/** Resolves only declared caller-input binding positions. Values stay in the run's secret frame. */
export function fluxNodePipelineSourceSecrets(inputs: JsonObject, pointers: readonly string[]): string[] {
  const root: JsonObject = { inputs };
  return pointers.flatMap((pointer) => {
    let value: JsonValue | undefined = root;
    for (const step of pointer.split("/").slice(1).map((part) => part.replace(/~1/gu, "/").replace(/~0/gu, "~"))) value = value !== null && typeof value === "object" && Object.hasOwn(value, step) ? (value as JsonObject)[step] : undefined;
    return typeof value === "string" && value.length > 0 ? [value] : [];
  });
}
