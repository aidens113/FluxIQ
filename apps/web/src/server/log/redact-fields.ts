import type { LogFields } from "./types";

/** Keys whose values never reach a log line. */
const SECRET_KEY = /token|cookie|code|secret|password|key|authorization|session|body/iu;
const REDACTED = "[redacted]";
const MAX_DEPTH = 6;

/** Copies `fields`, replacing the value of every key that looks secret, at any depth, with a marker. */
export function redactFields(fields: LogFields): Record<string, unknown> {
  return redactObject(fields, 0);
}

function redactObject(value: object, depth: number): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    result[key] = SECRET_KEY.test(key) ? REDACTED : redactValue(entry, depth + 1);
  }
  return result;
}

function redactValue(value: unknown, depth: number): unknown {
  if (typeof value !== "object" || value === null) return value;
  if (depth > MAX_DEPTH) return REDACTED;
  if (Array.isArray(value)) return value.map((entry) => redactValue(entry, depth + 1));
  return redactObject(value, depth);
}
