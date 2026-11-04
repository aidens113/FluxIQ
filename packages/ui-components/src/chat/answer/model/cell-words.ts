// A row's value as the text a cell shows.

import type { ChatJsonValue } from "../../ports/index.ts";

/** `value` as a person reads it in a table. */
export function cellWords(value: ChatJsonValue | undefined): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "number") return String(value);
  return JSON.stringify(value);
}
