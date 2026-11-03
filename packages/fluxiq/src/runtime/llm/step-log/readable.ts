/**
 * A JSON value as a person reads it: keys and list items one per line, nested
 * values indented, and a string with line breaks as an indented block under a
 * `|` rather than one line of `\n` escapes. A page view the model was shown
 * reads here as the page it was.
 */
export function automationStudioLlmStepLogReadable(value: unknown, indent = ""): string {
  return block(value, indent).join("\n");
}

function block(value: unknown, indent: string): string[] {
  if (Array.isArray(value) && value.length) return value.flatMap((item) => entry(`${indent}-`, item, `${indent}  `));
  if (isRecord(value) && Object.keys(value).length) return Object.entries(value).flatMap(([key, item]) => entry(`${indent}${key}:`, item, `${indent}  `));
  return entry("", value, indent).map((text, index) => (index === 0 ? `${indent}${text}` : text));
}

/** A value under `head` (a key or a list dash): inline when it fits on the line, else on the lines below. */
function entry(head: string, value: unknown, inner: string): string[] {
  const lead = head ? `${head} ` : "";
  if (typeof value === "string") {
    if (value.includes("\n")) return [`${lead}|`, ...value.split(/\r?\n/u).map((text) => `${inner}${text}`)];
    return [`${lead}${value === "" ? "\"\"" : value}`];
  }
  if (Array.isArray(value)) return value.length ? [head, ...block(value, inner)] : [`${lead}[]`];
  if (isRecord(value)) return Object.keys(value).length ? [head, ...block(value, inner)] : [`${lead}{}`];
  return [`${lead}${value === undefined ? "undefined" : JSON.stringify(value)}`];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
