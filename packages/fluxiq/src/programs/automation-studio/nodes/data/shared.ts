import type { JsonValue } from "../../../../core/index.ts";

export function variableName(value: unknown): string {
  return String(value ?? "").trim();
}

export function readVariable(variables: Map<string, JsonValue> | undefined, name: string): JsonValue {
  return variables?.get(name) ?? null;
}

export function writeVariable(variables: Map<string, JsonValue> | undefined, name: string, value: JsonValue): void {
  variables?.set(name, value);
}
