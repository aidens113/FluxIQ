// Where a value starts in compact JSON text, by its path of object keys: shared by the adapter's two ways of splitting a
// user message into blocks at entry boundaries (`./cache-content.ts`, `./trail-cache-content.ts`).

/** The offset in `JSON.stringify(object)` at which the value under `path` starts; none where the path is not there. */
export function automationStudioAnthropicJsonValueOffset(object: Record<string, unknown>, path: readonly string[], offset = 0): number | undefined {
  const [head, ...tail] = path;
  let at = offset + 1;
  for (const [key, value] of Object.entries(object)) {
    at += JSON.stringify(key).length + 1;
    if (key === head) {
      if (!tail.length) return at;
      return value && typeof value === "object" && !Array.isArray(value) ? automationStudioAnthropicJsonValueOffset(value as Record<string, unknown>, tail, at) : undefined;
    }
    at += JSON.stringify(value).length + 1;
  }
  return undefined;
}
