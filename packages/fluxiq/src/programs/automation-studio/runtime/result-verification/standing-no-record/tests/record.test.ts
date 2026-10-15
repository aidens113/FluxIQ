// Core's record of a build test judged no (t633): what it stored and read
// with, the stored rows a standing no called not the asked kind, and the
// conditions each standing no asks to remove -- through the build-test judge a
// candidate trial and a subflow trial both ask, with a scripted provider. A
// runtime check keeps none. No model is called.
import { describe, expect, it } from "vitest";
import type { AutomationStudioLlmProvider } from "../../../llm/index.ts";
import { automationStudioBuildTestJudge } from "../../build-test/index.ts";
import { CAMP_CEDAR, CAMP_LARCH, CAMP_OSPREY, CAMP_READ, CAMP_WILLOW, campsiteInstruction, campsiteRunSummary, NAME_CONDITIONS } from "../../refuted-no/tests/campsite-fixture.ts";
import { CAMPSITE_YES, DROP_NAME_CONDITIONS_NO, GAP_AND_CHANGE_NO, GAP_NO, WRONGLY_LEFT_OUT_NO } from "../../refuted-no/tests/campsite-readings-fixture.ts";
import { verifyAutomationStudioRunResult } from "../../verify.ts";
import { CABIN_KEPT_NO, CAMP_CABIN, cabinKeptSummary, cabinLeftOutSummary } from "./campsite-swing-fixture.ts";

const USAGE = { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: 0.001 };
const no = (reading: Record<string, string>) => ({ answersRequest: "no", ...reading });

/** A provider answering each call with its own diagnosis. */
function answering(...diagnoses: Record<string, unknown>[]): AutomationStudioLlmProvider {
  let calls = 0;
  return {
    metadata: { provider: "mock", model: "debug-model" },
    runTask: async () => ({ response: { kind: "diagnosis", summary: "Judged.", diagnosis: diagnoses[calls++] ?? {} }, usage: USAGE })
  };
}

const judge = (provider: AutomationStudioLlmProvider) =>
  automationStudioBuildTestJudge({ instructions: [campsiteInstruction()], deniedEvidenceKeys: [], projectId: "project-1", flowId: "flow-1", provider });

/** The name conditions as revisions are compared by them: lower case. */
const NAME_KEYS = [NAME_CONDITIONS.campground.toLowerCase(), NAME_CONDITIONS.notCabin.toLowerCase()];

describe("Core's record of a build test's no (t633)", () => {
  it("keeps the stored row a standing no called not the asked kind, by its own exclusion's words", async () => {
    const verdict = await judge(answering(no(CABIN_KEPT_NO), no(CABIN_KEPT_NO)))({ summary: cabinKeptSummary(), budget: { maxCostUsd: 0.2 } });
    expect(verdict.verdict).toBe("no");
    const record = verdict.verdict === "no" ? verdict.standingNo : undefined;
    expect(record).toBeDefined();
    expect(record!.upheldKind).toEqual([CAMP_CABIN.name]);
    expect(record!.stored).toContain(CAMP_CABIN.name);
    expect(record!.storedWhole).toBe(true);
    // Three conditions, compared by their wording without Core's aside on the value a kept row showed.
    expect(record!.conditions.map((condition) => condition.key)).toEqual(["promoted is absent", "availability contains [\"open this weekend\"]", "rating atleast 4"]);
    // The advice adds a condition: no remedy that only removes conditions.
    expect(record!.standing).toEqual([{ call: 1 }, { call: 2 }]);
    // Nothing of it reaches what the judge's no says to a model.
    expect(JSON.stringify({ ...verdict, standingNo: undefined })).not.toContain("upheldKind");
  });

  it("keeps the conditions a standing no asks to remove, where its reading names no row besides", async () => {
    const verdict = await judge(answering(no(DROP_NAME_CONDITIONS_NO), no(DROP_NAME_CONDITIONS_NO)))({ summary: cabinLeftOutSummary(), budget: { maxCostUsd: 0.2 } });
    expect(verdict.verdict).toBe("no");
    const record = verdict.verdict === "no" ? verdict.standingNo : undefined;
    expect(record!.standing).toEqual([{ call: 1, drops: NAME_KEYS }, { call: 2, drops: NAME_KEYS }]);
    expect(record!.stored).not.toContain(CAMP_CABIN.name);
    expect(record!.stored).toHaveLength(4);
    expect(record!.upheldKind).toBeUndefined();
  });

  it("keeps no remedy for a no that names a row the read left out", async () => {
    const verdict = await judge(answering(no(WRONGLY_LEFT_OUT_NO), no(WRONGLY_LEFT_OUT_NO)))({ summary: campsiteRunSummary({ nameDrops: true }), budget: { maxCostUsd: 0.2 } });
    expect(verdict.verdict).toBe("no");
    const record = verdict.verdict === "no" ? verdict.standingNo : undefined;
    expect(record!.standing).toEqual([{ call: 1 }, { call: 2 }]);
  });

  it("is kept only for a build test: a runtime check's double no carries none", async () => {
    const report = await verifyAutomationStudioRunResult({
      projectId: "project-1", flowId: "flow-1", runId: "run-1", summary: cabinKeptSummary(), instructions: [campsiteInstruction()], deniedEvidenceKeys: [],
      provider: answering(no(CABIN_KEPT_NO), no(CABIN_KEPT_NO))
    });
    expect(report.outcome).toMatchObject({ performed: true, verdict: "does_not_answer" });
    expect(report.outcome).not.toHaveProperty("standingNo");
  });

  // A8 wave 14 candidate towels `run-mv9ul5dy-e9a1b1c1`, trial 2 (t641): the exact rows, judged no on advice the record refutes in part.
  it("says where each condition stands, and which left out only rows Core's record accounts for, whatever the judges said", async () => {
    const verdict = await judge(answering(no(GAP_AND_CHANGE_NO), no(GAP_NO)))({ summary: campsiteRunSummary(), budget: { maxCostUsd: 0.2 } });
    const record = verdict.verdict === "no" ? verdict.standingNo : undefined;
    expect(record).toBeDefined();
    expect(record!.conditions.map((condition) => [condition.nodeId, condition.number])).toEqual([1, 2, 3, 4, 5].map((number) => [CAMP_READ, number]));
    const byNumber = new Map(record!.conditions.map((condition) => [condition.number, condition]));
    // Condition 1: each row it left out by itself is another copy of a stored row.
    expect(byNumber.get(1)?.keptOut).toEqual([{ label: CAMP_CEDAR.name, by: "also_in_result" }, { label: "Pine Ridge Campground, Walk-in Site 7", by: "also_in_result" }]);
    // Condition 2: each shows a value Core read failing the request's own words.
    expect(byNumber.get(2)?.keptOut?.map((row) => row.label)).toEqual([CAMP_LARCH, CAMP_OSPREY, CAMP_WILLOW]);
    expect(byNumber.get(2)?.keptOut?.every((row) => row.by === "request_words" && (row.texts?.length ?? 0) > 0)).toBe(true);
    // A numeric bound's settled row is not the request's words; a condition that left out no row by itself keeps out nothing.
    for (const number of [3, 4, 5]) expect(byNumber.get(number)?.keptOut).toBeUndefined();
  });

  it("is not kept on a yes", async () => {
    const verdict = await judge(answering(CAMPSITE_YES, CAMPSITE_YES))({ summary: cabinLeftOutSummary(), budget: { maxCostUsd: 0.2 } });
    expect(verdict).toMatchObject({ verdict: "yes" });
    expect(verdict).not.toHaveProperty("standingNo");
  });
});
