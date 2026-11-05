/** The index just past the first complete top-level object in `text`, or `undefined` when there is none. */
export function automationStudioAnthropicObjectEnd(text: string): number | undefined {
  let index = 0;
  while (index < text.length && /\s/u.test(text.charAt(index))) index += 1;
  if (text.charAt(index) !== "{") return undefined;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (; index < text.length; index += 1) {
    const char = text.charAt(index);
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{" || char === "[") depth += 1;
    else if (char === "}" || char === "]") {
      depth -= 1;
      if (depth === 0) return index + 1;
      if (depth < 0) return undefined;
    }
  }
  return undefined;
}
