import type { JsonValue } from "../../../../core/index.ts";

/** A field path in words: `seller.name` as written, a list of steps joined by dots. */
export function outlineFieldWords(field: JsonValue | undefined): string {
  if (typeof field === "string") return field;
  if (Array.isArray(field)) return field.map((step) => String(step)).join(".");
  return "a field";
}
