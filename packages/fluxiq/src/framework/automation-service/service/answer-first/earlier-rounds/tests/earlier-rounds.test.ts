// What a fresh round starts with of its earlier rounds (t1014, t1036 D10): the state of what the run established and one
// short line for every other call, never a call's result whole and never a page. The site is made up and shares nothing
// with a realistic scenario.
import { describe, expect, it } from "vitest";
// The LLM runtime first, as the service loads it: the trail's screen reads its evidence keys through that barrel.
import { screenAutomationStudioLlmEvidence } from "../../../../../../runtime/llm/index.ts";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioResultTrailStep } from "../../../../../../runtime/result-verification/index.ts";
import { AUTOMATION_STUDIO_ANSWER_FIRST_EARLIER_ROUNDS_TOOL_ID, automationStudioAnswerFirstEarlierRounds } from "../index.ts";

const PAGE_TEXT = "the whole page as it was seen";
const trail: AutomationStudioResultTrailStep[] = [
  { callId: "initial.look", did: "garden.look", outcome: "answered", where: "garden://beds", found: { page: { text: PAGE_TEXT } } },
  { callId: "find.1", did: "garden.find", asked: { query: "seedlings" }, outcome: "web.inspect.succeeded", where: "garden://beds", found: { matches: [{ handle: "h7", text: "Seedlings tray" }], page: { text: PAGE_TEXT } } },
  { callId: "read.1", did: "domain.garden.read_beds", on: "bed, crop", asked: { parameters: {} }, outcome: "answered", where: "garden://beds", found: { read: { extracted: [{ bed: "North", crop: "Beans" }, { bed: "South", crop: "Kale" }] }, page: { text: PAGE_TEXT } } },
  { callId: "water.1", did: "domain.garden.water", on: "Water North", asked: { parameters: { bed: "North" }, consequences: ["modify_existing"] }, outcome: "web.action.rejected.target_not_found", where: "garden://beds", found: { ok: false, code: "target_not_found", secretToken: "abc" } },
  { callId: "find.2", did: "garden.find", asked: { query: "kale" }, outcome: "web.inspect.succeeded", where: "garden://beds", found: { matches: [{ handle: "h9", text: "Kale row" }] } }
];
const keys = { observedStateKeys: ["page", "read.extracted"], deniedEvidenceKeys: ["secretToken"] };
const groupsOf = (value: JsonObject | undefined): JsonObject[] => (value?.calls ?? []) as JsonObject[];

describe("the earlier rounds a fresh round starts with", () => {
  it("names every earlier call: each read by its call, rows and columns, and every other call as one line", () => {
    const entry = automationStudioAnswerFirstEarlierRounds({ trail, ...keys });
    expect(entry?.toolId).toBe(AUTOMATION_STUDIO_ANSWER_FIRST_EARLIER_ROUNDS_TOOL_ID);
    expect(entry?.value.count).toBe(5);
    expect(entry?.value.reads).toEqual([{ n: 3, callId: "read.1", did: "domain.garden.read_beds", on: "bed, crop", where: "garden://beds", member: "read.extracted", rows: 2, columns: ["bed", "crop"] }]);
    // The rest, grouped by what ran and how it ended; the last of a group is the latest of its kind.
    expect(groupsOf(entry?.value)).toEqual([
      { did: "garden.look", outcome: "answered", calls: ["#1 initial.look"] },
      { did: "garden.find", outcome: "web.inspect.succeeded", calls: ["#2 find.1 {\"query\":\"seedlings\"}", "#5 find.2 {\"query\":\"kale\"}"] },
      { did: "domain.garden.water", outcome: "web.action.rejected.target_not_found", calls: ["#4 water.1 Water North"] }
    ]);
  });

  it("carries no call's result and no page, and leaves out what the domain denies", () => {
    const entry = automationStudioAnswerFirstEarlierRounds({ trail, ...keys });
    const shown = JSON.stringify(entry);
    expect(shown).not.toContain(PAGE_TEXT);
    expect(shown).not.toContain("Seedlings tray");
    expect(shown).not.toContain("Beans");
    expect(shown).not.toContain("view_not_carried");
    expect(shown).not.toContain("secretToken");
    expect(screenAutomationStudioLlmEvidence(entry?.value, keys.deniedEvidenceKeys).deniedKey).toBe(false);
  });

  // run-mwus396e-5447c6f6: a Flow replay's list read carries the domain's saved binding under keys the domain denies; an
  // entry with one anywhere had every fresh round's first request refused unsent.
  it("holds no denied key at any depth, so the round's request is sent", () => {
    const denied = ["selector", "extractionBinding", "bed"];
    const replayed: AutomationStudioResultTrailStep[] = [
      { callId: "bed.list.1", did: "domain.garden.read_beds", asked: { node: "domain.garden.read_beds", parameters: { list: { extractionBinding: { item: "ul > li" } } } }, outcome: "core.replay.replayed", where: "garden://beds?page=2", found: { read: { extracted: [{ bed: "East", crop: "Peas" }] } } }
    ];
    const entry = automationStudioAnswerFirstEarlierRounds({ trail: replayed, observedStateKeys: keys.observedStateKeys, deniedEvidenceKeys: denied });
    expect(screenAutomationStudioLlmEvidence(entry?.value, denied).deniedKey).toBe(false);
    expect(entry?.value.reads).toEqual([expect.objectContaining({ rows: 1, columns: ["bed", "crop"] })]);
    // No member is carried under a denied key: the call's input is only a short line of words.
    expect(JSON.stringify(entry?.value)).not.toContain("\"extractionBinding\":");
  });

  it("stays small as the run grows: a read's rows are counted, never carried, and no call is left out", () => {
    const many: AutomationStudioResultTrailStep[] = Array.from({ length: 200 }, (_, index) => index % 2 === 0
      ? { callId: `read.${index}`, did: "domain.garden.read_beds", outcome: "answered", where: `garden://beds?page=${index}`, found: { read: { extracted: Array.from({ length: 20 }, (_, row) => ({ bed: `Bed ${index}.${row}`, crop: "Beans and a long description of the crop" })) } } }
      : { callId: `find.${index}`, did: "garden.find", asked: { query: `bed ${index}` }, outcome: "web.inspect.succeeded", found: { found: "x".repeat(5_000) } });
    const entry = automationStudioAnswerFirstEarlierRounds({ trail: many, ...keys });
    expect(entry?.value.reads).toHaveLength(100);
    expect(groupsOf(entry?.value).flatMap((group) => group.calls as string[])).toHaveLength(100);
    expect(JSON.stringify(entry).length).toBeLessThan(25_000);
    expect(JSON.stringify(entry)).not.toContain("Beans and a long description");
  });

  it("reads a read's rows under the domain's read key where its views do not declare them", () => {
    const entry = automationStudioAnswerFirstEarlierRounds({ trail, observedStateKeys: ["page"], readRowsKey: "read.extracted", deniedEvidenceKeys: [] });
    expect(entry?.value.reads).toEqual([expect.objectContaining({ callId: "read.1", rows: 2, member: "read.extracted" })]);
  });

  it("is nothing where no call came before the round", () => {
    expect(automationStudioAnswerFirstEarlierRounds({ trail: [], ...keys })).toBeUndefined();
  });
});
