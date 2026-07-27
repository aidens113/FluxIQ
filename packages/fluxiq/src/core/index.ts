export type ResultState = "running" | "success" | "failed" | "timeout" | "cancelled" | "rejected";

export type FrameworkResult<TPayload = unknown> = {
  state: ResultState;
  message?: string;
  payload?: TPayload;
};

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export type Clock = {
  now(): Date;
  nowMs(): number;
};

export const systemClock: Clock = {
  now: () => new Date(),
  nowMs: () => Date.now()
};

export function createId(prefix: string, value: string): string {
  const cleanPrefix = slugify(prefix) || "id";
  const cleanValue = slugify(value) || "item";
  return `${cleanPrefix}.${cleanValue}`;
}

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
