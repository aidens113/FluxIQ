type TextBlock = { type: "text"; text: string; cache_control?: { type: "ephemeral" } };

/**
 * Preserve the exact JSON projection, splitting only at array entry boundaries.
 * Caching a growing evidence window at its last entry lets the next request
 * reuse that prefix; caching only its varying closing context cannot do that.
 */
export function automationStudioAnthropicCacheContent(text: string, evidence: readonly unknown[] | undefined): string | TextBlock[] {
  if (!evidence) return text;
  const payload = JSON.parse(text) as Record<string, unknown>;
  const start = valueOffset(payload, ["context", "evidenceLoop", "evidence"]);
  if (start === undefined || text.charAt(start) !== "[") throw new Error("Evidence projection is not the shared task projection.");
  const cache_control = { type: "ephemeral" as const };
  const blocks: TextBlock[] = [{ type: "text", text: text.slice(0, start + 1), cache_control }];
  let end = start + 1;
  for (let index = 0; index < evidence.length; index += 1) {
    // Read the projected entry rather than the raw context: the shared task
    // projection may have placed a described node on this very entry.
    const projected = (payload.context as { evidenceLoop: { evidence: unknown[] } }).evidenceLoop.evidence[index];
    const bytes = `${index ? "," : ""}${JSON.stringify(projected)}`;
    if (text.slice(end, end + bytes.length) !== bytes) throw new Error("Evidence projection boundary mismatch.");
    end += bytes.length;
    blocks.push({ type: "text", text: bytes, ...(index === evidence.length - 1 ? { cache_control } : {}) });
  }
  blocks.push({ type: "text", text: text.slice(end) });
  return blocks;
}

function valueOffset(object: Record<string, unknown>, path: readonly string[], offset = 0): number | undefined {
  const [head, ...tail] = path;
  let at = offset + 1;
  for (const [key, value] of Object.entries(object)) {
    at += JSON.stringify(key).length + 1;
    if (key === head) {
      if (!tail.length) return at;
      return value && typeof value === "object" && !Array.isArray(value) ? valueOffset(value as Record<string, unknown>, tail, at) : undefined;
    }
    at += JSON.stringify(value).length + 1;
  }
  return undefined;
}
