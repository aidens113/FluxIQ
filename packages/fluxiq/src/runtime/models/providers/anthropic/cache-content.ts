type TextBlock = { type: "text"; text: string; cache_control?: { type: "ephemeral" } };

/** One evidence entry as the projection wrote it: only what the rule below reads of it. */
export type AutomationStudioAnthropicCacheEntry = { callId: string; toolId: string };

/**
 * A marker looks back at most 20 blocks for an earlier request's, counting itself
 * as the first (the prompt-caching page, "lookback window"). The second marker sits
 * this many entries before the last, where the last's reach ends, so a request that
 * appended up to 38 entries still reads what the one before it wrote.
 */
const LOOKBACK_STEP = 19;

/**
 * Preserve the exact JSON projection, splitting only at evidence-entry
 * boundaries, and mark what the next request will send again unchanged.
 *
 * A cache matches a prefix, and it is read back only at a place a request marked.
 * So the markers go at the end of the head, and on the last entry before the first
 * one `moves` names (`../../../llm/evidence-moves/evidence-that-moves.ts`): a marker on an entry
 * that changes on every call pays the write premium for bytes never read back,
 * which is what `run-mw37vz9n-a77a02c2` did on all 51 of its decisions. With one
 * more on the system prompt (`./request-body.ts`), a request has at most 4.
 *
 * The text is untouched: the blocks concatenate to exactly `text`.
 */
export function automationStudioAnthropicCacheContent(text: string, moves: (entry: AutomationStudioAnthropicCacheEntry) => boolean): string | TextBlock[] {
  const payload = JSON.parse(text) as Record<string, unknown>;
  const start = valueOffset(payload, ["context", "evidenceLoop", "evidence"]);
  if (start === undefined || text.charAt(start) !== "[") throw new Error("Evidence projection is not the shared task projection.");
  const entries = (payload.context as { evidenceLoop: { evidence: AutomationStudioAnthropicCacheEntry[] } }).evidenceLoop.evidence;
  const cache_control = { type: "ephemeral" as const };
  const firstMoving = entries.findIndex(moves);
  const settled = firstMoving === -1 ? entries.length : firstMoving;
  const marked = new Set(settled > 0 ? [settled - 1, ...(settled - 1 - LOOKBACK_STEP >= 0 ? [settled - 1 - LOOKBACK_STEP] : [])] : []);
  const blocks: TextBlock[] = [{ type: "text", text: text.slice(0, start + 1), cache_control }];
  let end = start + 1;
  entries.forEach((entry, index) => {
    const bytes = `${index ? "," : ""}${JSON.stringify(entry)}`;
    if (text.slice(end, end + bytes.length) !== bytes) throw new Error("Evidence projection boundary mismatch.");
    end += bytes.length;
    blocks.push({ type: "text", text: bytes, ...(marked.has(index) ? { cache_control } : {}) });
  });
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
