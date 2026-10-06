// How a stored cell reads as text, for conditions, sort keys and row identity.
// Internal to process/ and not re-exported.
//
// A cell captured from a screen carries the screen's layout, so text compares
// with runs of whitespace collapsed and the ends trimmed. A blank cell, `null`
// and a missing one all mean the value was not there. A number or boolean reads
// as its own text, and any other value as its JSON.

/** The value's text with its layout removed. */
export function collapsedText(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

/** The value's text with its layout and case removed. */
export function foldedText(value: string): string {
  return collapsedText(value).toLowerCase();
}

/** The cell as text, or `undefined` for a cell that holds no value. */
export function cellText(cell: unknown): string | undefined {
  if (cell === undefined || cell === null) return undefined;
  if (typeof cell === "string") return collapsedText(cell) === "" ? undefined : cell;
  if (typeof cell === "number" || typeof cell === "boolean") return String(cell);
  return JSON.stringify(cell);
}

/** A row's own value for a field, never one inherited from its prototype. */
export function cellOf(values: Readonly<Record<string, unknown>>, field: string): unknown {
  return Object.prototype.hasOwnProperty.call(values, field) ? values[field] : undefined;
}
