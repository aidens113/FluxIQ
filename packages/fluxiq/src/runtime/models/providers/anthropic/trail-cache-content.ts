// A judge's user message, split so the trail it is shown is read back from cache by the next judge call of the same
// attempt (t965). Live run `run-mwodpw10-3d5748ab`: two judge calls in a row read the same 211k-token trail at full
// price (0091, 0092). The judge's summary carries the trail first after its question
// (`../../../result-verification/flow-less/judged-summary.ts`), so everything up to its end is the same bytes from one
// call to the next while the attempt only adds entries; the rows, views and reads that change come after it.
//
// The trail's entries become blocks of their own, and the last entry is marked, so a call that sent the same trail
// reads it back; one that added entries reads back the earlier call's marked prefix, which a marker finds within 20
// blocks of itself (the prompt-caching lookback), so a second marker sits that far before the last, as the evidence
// split does (`./cache-content.ts`). With the system prompt's marker, a request has at most 3. The text is untouched:
// the blocks concatenate to exactly `text`. A message with no trail is left as it is.

import { automationStudioAnthropicJsonValueOffset } from "./json-offset.ts";

type TextBlock = { type: "text"; text: string; cache_control?: { type: "ephemeral" } };

/** The second marker's distance before the last entry: the lookback, counting the marked block itself. */
const LOOKBACK_STEP = 19;
const TRAIL_ENTRIES = ["context", "resultSummary", "trail", "entries"] as const;

export function automationStudioAnthropicTrailCacheContent(text: string): TextBlock[] | undefined {
  // The task's user message is its JSON projection, as the evidence split reads it (`./cache-content.ts`).
  const payload = JSON.parse(text) as Record<string, unknown>;
  const start = automationStudioAnthropicJsonValueOffset(payload, TRAIL_ENTRIES);
  if (start === undefined || text.charAt(start) !== "[") return undefined;
  const entries = (((payload.context as Record<string, unknown>).resultSummary as Record<string, unknown>).trail as { entries: unknown[] }).entries;
  if (!Array.isArray(entries) || entries.length === 0) return undefined;
  const last = entries.length - 1;
  const marked = new Set([last, ...(last - LOOKBACK_STEP >= 0 ? [last - LOOKBACK_STEP] : [])]);
  const cache_control = { type: "ephemeral" as const };
  const blocks: TextBlock[] = [{ type: "text", text: text.slice(0, start + 1) }];
  let end = start + 1;
  for (const [index, entry] of entries.entries()) {
    const bytes = `${index ? "," : ""}${JSON.stringify(entry)}`;
    if (text.slice(end, end + bytes.length) !== bytes) return undefined;
    end += bytes.length;
    blocks.push({ type: "text", text: bytes, ...(marked.has(index) ? { cache_control } : {}) });
  }
  blocks.push({ type: "text", text: text.slice(end) });
  return blocks;
}
