/**
 * A reply may encode a credential inside JSON text inside another JSON value.
 * Screen each decoded layer, including property names, before any reply is
 * logged or returned. Excessive nesting is refused rather than left unchecked.
 */
export function automationStudioAnthropicReplyContainsCredential(value: unknown, credential: string): boolean {
  const pending = [{ value, depth: 0 }];
  const seen = new WeakSet<object>();
  while (pending.length) {
    const current = pending.pop()!;
    if (current.depth > 96) return true;
    if (typeof current.value === "string") {
      if (current.value.includes(credential)) return true;
      const trimmed = current.value.trim();
      if (!["{", "[", '\"'].includes(trimmed.charAt(0))) continue;
      const decoded = jsonValue(trimmed);
      if (decoded.parsed) pending.push({ value: decoded.value, depth: current.depth + 1 });
    } else if (current.value && typeof current.value === "object") {
      if (seen.has(current.value)) continue;
      seen.add(current.value);
      for (const [key, child] of Object.entries(current.value)) {
        pending.push({ value: key, depth: current.depth + 1 }, { value: child, depth: current.depth + 1 });
      }
    }
  }
  return false;
}

/** Ordinary prose is not JSON; this is a classified parse result, never a failed provider read. */
function jsonValue(text: string): { parsed: true; value: unknown } | { parsed: false } {
  try { return { parsed: true, value: JSON.parse(text) as unknown }; }
  catch { return { parsed: false }; }
}
