// What a fresh round starts with of its earlier rounds (t1014): every call, with what it found, no page view, and the
// oldest summarised rather than dropped where the window is short. The site is made up and shares nothing with a
// realistic scenario.
import { describe, expect, it } from "vitest";
// The LLM runtime first, as the service loads it: the trail's screen reads its evidence keys through that barrel.
import { screenAutomationStudioLlmEvidence } from "../../../../../../runtime/llm/index.ts";
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

  it("never carries a page view, and leaves out what the domain denies", () => {
    const entry = automationStudioAnswerFirstEarlierRounds({ trail, ...keys });
    const shown = JSON.stringify(entry);
    expect(shown).not.toContain(PAGE_TEXT);
    expect(callsOf(entry?.value).every((call) => (call.found as JsonObject | undefined)?.page === undefined || (call.found as JsonObject).page === AUTOMATION_STUDIO_ANSWER_FIRST_VIEW_NOT_CARRIED)).toBe(true);
    expect(shown).not.toContain("\"abc\"");
    // The denied key goes with its value: a marker under it would have the whole request refused unsent (t1018).
    expect(shown).not.toContain("secretToken");
    expect(callsOf(entry?.value)[3]).toMatchObject({ found: { ok: false, code: "target_not_found" }, withheld: expect.stringContaining("left out") });
    expect(screenAutomationStudioLlmEvidence(entry?.value, keys.deniedEvidenceKeys).deniedKey).toBe(false);
  });

  // run-mwus396e-5447c6f6: a Flow replay's list read carries the domain's saved binding, selectors and all, under keys
  // the domain denies; carried with a marker under them, every fresh round's first request was refused unsent.
  it("carries a replayed call whose input holds denied keys at any depth without any of them, so the round's request is sent", () => {
    const denied = ["selector", "extractionBinding"];
    const replayed: AutomationStudioResultTrailStep[] = [
      { callId: "bed.list.loop.forward.1.pass.1", did: "domain.garden.read_beds", asked: { node: "domain.garden.read_beds", parameters: { list: { handle: "list.2", fields: { bed: "bed_name" }, extractionBinding: { item: "ul > li", fields: { bed_name: { kind: "text", selector: ":scope span" } } } } } }, outcome: "core.replay.replayed", where: "garden://beds?page=2", found: { read: { extracted: [{ bed: "East" }] } } },
      { callId: "find.2", did: "garden.find", asked: { query: "tray", Selector: "#t" }, outcome: "web.inspect.succeeded", where: "garden://beds?page=2", found: { matches: [{ handle: "h9", text: "Tray" }] } }
    ];
    const entry = automationStudioAnswerFirstEarlierRounds({ trail: replayed, observedStateKeys: keys.observedStateKeys, deniedEvidenceKeys: denied });
    expect(screenAutomationStudioLlmEvidence(entry?.value, denied).deniedKey).toBe(false);
    const calls = callsOf(entry?.value);
    expect(calls[0]).toMatchObject({ asked: { node: "domain.garden.read_beds", parameters: { list: { handle: "list.2", fields: { bed: "bed_name" } } } }, found: { read: { extracted: [{ bed: "East" }] } }, withheld: expect.any(String) });
    expect(JSON.stringify(calls[0])).not.toMatch(/extractionBinding|selector/iu);
    // Core compares keys with `_` and `-` removed and lowercased, so another spelling goes too.
    expect(calls[1]).toMatchObject({ asked: { query: "tray" }, withheld: expect.any(String) });
    expect((calls[1]!.asked as JsonObject).Selector).toBeUndefined();
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
