// What a fresh round starts with of its earlier rounds (t1014): every call, with what it found, no page view, and the
// oldest summarised rather than dropped where the window is short. The site is made up and shares nothing with a
// realistic scenario.
import { describe, expect, it } from "vitest";
// The LLM runtime first, as the service loads it: the trail's screen reads its evidence keys through that barrel.
import "../../../../../../runtime/llm/index.ts";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioResultTrailStep } from "../../../../../../runtime/result-verification/index.ts";
import { AUTOMATION_STUDIO_ANSWER_FIRST_EARLIER_ROUNDS_TOOL_ID, AUTOMATION_STUDIO_ANSWER_FIRST_VIEW_NOT_CARRIED, automationStudioAnswerFirstEarlierRounds } from "../index.ts";

const PAGE_TEXT = "the whole page as it was seen";
const trail: AutomationStudioResultTrailStep[] = [
  { callId: "initial.look", did: "garden.look", outcome: "answered", where: "garden://beds", found: { page: { text: PAGE_TEXT } } },
  { callId: "find.1", did: "garden.find", asked: { query: "seedlings" }, outcome: "web.inspect.succeeded", where: "garden://beds", found: { matches: [{ handle: "h7", text: "Seedlings tray" }], page: { text: PAGE_TEXT } } },
  { callId: "read.1", did: "domain.garden.read_beds", asked: { parameters: {} }, outcome: "answered", where: "garden://beds", found: { read: { extracted: [{ bed: "North", crop: "Beans" }, { bed: "South", crop: "Kale" }] }, page: { text: PAGE_TEXT } } },
  { callId: "water.1", did: "domain.garden.water", asked: { parameters: { bed: "North" }, consequences: ["modify_existing"] }, outcome: "web.action.rejected.target_not_found", where: "garden://beds", found: { ok: false, code: "target_not_found", secretToken: "abc" } }
];
const keys = { observedStateKeys: ["page", "read.extracted"], deniedEvidenceKeys: ["secretToken"] };
const callsOf = (value: JsonObject | undefined): JsonObject[] => (value?.calls ?? []) as JsonObject[];

describe("the earlier rounds a fresh round starts with", () => {
  it("holds every earlier call in order, with what it was asked, how it came back, where and what it found", () => {
    const entry = automationStudioAnswerFirstEarlierRounds({ trail, ...keys });
    expect(entry?.toolId).toBe(AUTOMATION_STUDIO_ANSWER_FIRST_EARLIER_ROUNDS_TOOL_ID);
    const calls = callsOf(entry?.value);
    expect(calls.map((call) => [call.n, call.did, call.outcome])).toEqual([
      [1, "garden.look", "answered"],
      [2, "garden.find", "web.inspect.succeeded"],
      [3, "domain.garden.read_beds", "answered"],
      [4, "domain.garden.water", "web.action.rejected.target_not_found"]
    ]);
    // The finds and the read's rows are carried whole; so is what each call was asked and where it was.
    expect(calls[1]).toMatchObject({ asked: { query: "seedlings" }, where: "garden://beds", found: { matches: [{ handle: "h7", text: "Seedlings tray" }] } });
    expect(calls[2]).toMatchObject({ found: { read: { extracted: [{ bed: "North", crop: "Beans" }, { bed: "South", crop: "Kale" }] } } });
    expect(calls[3]).toMatchObject({ asked: { parameters: { bed: "North" } }, found: { ok: false, code: "target_not_found" } });
    expect(String(entry?.value.words)).toContain("earlier rounds");
    expect(entry?.value.summarised).toBeUndefined();
  });

  it("never carries a page view, and withholds what the domain denies", () => {
    const entry = automationStudioAnswerFirstEarlierRounds({ trail, ...keys });
    const shown = JSON.stringify(entry);
    expect(shown).not.toContain(PAGE_TEXT);
    expect(callsOf(entry?.value).every((call) => (call.found as JsonObject | undefined)?.page === undefined || (call.found as JsonObject).page === AUTOMATION_STUDIO_ANSWER_FIRST_VIEW_NOT_CARRIED)).toBe(true);
    expect(shown).not.toContain("\"abc\"");
    expect(callsOf(entry?.value)[3]).toMatchObject({ found: { secretToken: "[withheld]" } });
  });

  it("summarises the oldest calls' findings to fit a short window, and drops none", () => {
    const many: AutomationStudioResultTrailStep[] = Array.from({ length: 40 }, (_, index) => ({
      callId: `read.${index}`, did: "domain.garden.read_beds", asked: { parameters: { page: index } }, outcome: "answered", where: `garden://beds?page=${index}`,
      found: { read: { extracted: Array.from({ length: 20 }, (_, row) => ({ bed: `Bed ${index}.${row}`, crop: "Beans and a long description of the crop" })) } }
    }));
    const entry = automationStudioAnswerFirstEarlierRounds({ trail: many, ...keys, tokenLimits: { maxInputTokens: 60_000, maxOutputTokens: 1_000, maxTotalTokens: 61_000 } });
    const calls = callsOf(entry?.value);
    expect(calls).toHaveLength(40);
    expect(calls.map((call) => call.n)).toEqual(Array.from({ length: 40 }, (_, index) => index + 1));
    // The oldest are summarised in counts; the newest stay whole; every one keeps its outcome and place.
    expect(calls[0]).toMatchObject({ outcome: "answered", where: "garden://beds?page=0", found: { "core.summarised": { item: "found", kind: "object", lists: { "read.extracted": 20 } } } });
    expect(calls.at(-1)).toMatchObject({ found: { read: { extracted: expect.arrayContaining([{ bed: "Bed 39.0", crop: "Beans and a long description of the crop" }]) } } });
    expect(entry?.value.summarised).toMatchObject({ count: expect.any(Number) });
    expect(Buffer.byteLength(JSON.stringify(calls), "utf8")).toBeLessThanOrEqual(Math.floor(60_000 * 0.25 * 1.8) + calls.length);
  });

  it("is nothing where no call came before the round", () => {
    expect(automationStudioAnswerFirstEarlierRounds({ trail: [], ...keys })).toBeUndefined();
  });
});
