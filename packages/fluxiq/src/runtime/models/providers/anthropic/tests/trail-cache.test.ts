// t965: a judge's trail is read back from cache by the next judge call of the same attempt, and a refusal of a request
// too large for the model's window says so (`../trail-cache-content.ts`, `../size-refusal.ts`). Live run
// `run-mwodpw10-3d5748ab`: two judge calls in a row read a 211k-token trail at full price (0091, 0092), and a request
// the provider counted past the window was read as a server error (0117).
import { describe, expect, it } from "vitest";
import { automationStudioAnthropicRefusedForSize, automationStudioAnthropicTrailCacheContent } from "../index.ts";

const entry = (n: number) => ({ n, did: "page.read", outcome: "answered", found: { page: `Desk ${n} is free.` } });
const message = (entries: number, after = "rows") => JSON.stringify({
  taskKind: "loop_verification",
  context: { instructions: { body: "Reserve a desk." }, resultSummary: { question: "Was it got?", trail: { note: "how to read it", entries: Array.from({ length: entries }, (_, at) => entry(at + 1)) }, recordSets: [{ [after]: 1 }] } }
});

describe("a judge's message split for the cache", () => {
  it("keeps its text exactly, makes each trail entry a block, and marks the last entry, so what follows the trail is unmarked", () => {
    const text = message(3);
    const blocks = automationStudioAnthropicTrailCacheContent(text)!;
    expect(blocks.map((block) => block.text).join("")).toBe(text);
    expect(blocks).toHaveLength(1 + 3 + 1);
    expect(blocks.map((block) => block.cache_control !== undefined)).toEqual([false, false, false, true, false]);
    expect(blocks.at(-1)!.text).toContain("recordSets");
  });

  it("reads the earlier call's trail back when the attempt has added entries since: the same bytes up to its last entry", () => {
    const earlier = automationStudioAnthropicTrailCacheContent(message(25))!;
    const later = automationStudioAnthropicTrailCacheContent(message(30, "other"))!;
    const upTo = (blocks: typeof earlier, entries: number) => blocks.slice(0, 1 + entries).map((block) => block.text).join("");
    expect(upTo(later, 25)).toBe(upTo(earlier, 25));
    // The later call marks its last entry and one within the lookback of the earlier call's mark.
    const marks = later.flatMap((block, at) => (block.cache_control ? [at] : []));
    expect(marks).toEqual([1 + 29 - 19, 1 + 29]);
    expect(marks[1]! - 25).toBeLessThanOrEqual(19);
  });

  it("leaves a message with no trail as it is", () => {
    expect(automationStudioAnthropicTrailCacheContent(JSON.stringify({ context: { resultSummary: { question: "q" } } }))).toBeUndefined();
  });
});

describe("a refusal for size", () => {
  it("is a 400 whose message says the prompt is too long, or a 413, and nothing else", () => {
    expect(automationStudioAnthropicRefusedForSize(400, { type: "invalid_request_error", message: "prompt is too long: 1043211 tokens > 1000000 maximum" })).toBe(true);
    expect(automationStudioAnthropicRefusedForSize(400, { type: "invalid_request_error", message: "input length and `max_tokens` exceed context limit: 900000 + 128000 > 1000000" })).toBe(true);
    expect(automationStudioAnthropicRefusedForSize(413, null)).toBe(true);
    expect(automationStudioAnthropicRefusedForSize(400, { type: "invalid_request_error", message: "messages.0.content: field required" })).toBe(false);
    expect(automationStudioAnthropicRefusedForSize(500, { message: "prompt is too long" })).toBe(false);
  });
});
