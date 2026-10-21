// A stub-judge replay of A8 wave 14 candidate towels `run-mv9ul5dy-e9a1b1c1`,
// trial 2 (steps 0032-0034, t641), through the build-test judge a candidate
// trial and a subflow trial both ask, on the campsite search of
// `./campsite-fixture.ts`, whose exact revision stores exactly the campsites
// asked for. Both calls say no. Call 1 names a gap Core cannot settle and
// advises changing condition 1, every row of which, left out by itself, is
// another copy of a stored row; call 2 names only the gap. Before t641 call 1's
// advice reached the builder unlabelled, because its reading was not wholly
// refuted, and the builder dropped the condition. Now the verdict is still no,
// asked nothing more, and call 1's reading carries Core's label for the part
// its record contradicts. No model is called; the provider is scripted.
import { describe, expect, it } from "vitest";
import type { AutomationStudioLlmProvider } from "../../../llm/index.ts";
import { automationStudioBuildTestJudge } from "../../build-test/index.ts";
import { campsiteInstruction, campsiteRunSummary } from "./campsite-fixture.ts";
import { GAP_AND_CHANGE_NO, GAP_NO } from "./campsite-readings-fixture.ts";

const USAGE = { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: 0.001 };
const no = (reading: Record<string, string>) => ({ answersRequest: "no", ...reading, defects: [{ kind: "other", row: "Region filter", requestWords: "park service's search results" }] });

function answering(...diagnoses: Record<string, unknown>[]): AutomationStudioLlmProvider {
  let calls = 0;
  return { metadata: { provider: "mock", model: "debug-model" }, runTask: async () => ({ response: { kind: "diagnosis", summary: "Judged.", diagnosis: diagnoses[calls++] ?? diagnoses.at(-1) ?? {} }, usage: USAGE }) };
}

const judge = (provider: AutomationStudioLlmProvider) =>
  automationStudioBuildTestJudge({ instructions: [campsiteInstruction()], deniedEvidenceKeys: [], projectId: "project-1", flowId: "flow-1", provider });

/** Core's finding on condition 1, as its label carries it. */
const PROMOTED_FINDING = "Of the 2 rows condition 1 (promoted is absent) left out by itself, 2 are also a row of the result, another copy kept. Removing or loosening it alone brings back no row the request asks for.";

describe("a double no over the exact rows whose advice Core's record refutes in part (t641)", () => {
  it("keeps unmeasured region doubts unsure and labels the refuted condition advice", async () => {
    const verdict = await judge(answering(no(GAP_AND_CHANGE_NO), no(GAP_NO), no(GAP_AND_CHANGE_NO), no(GAP_NO)))({ summary: campsiteRunSummary(), budget: { maxCostUsd: 0.2 } });
    expect(verdict.verdict).toBe("unknown");
    if (verdict.verdict !== "unknown") return;
    expect(verdict.spent.calls).toBe(4);
    const advice = String(verdict.unconfirmedReading?.advice);
    expect(advice).toContain(`Judge call 1 (Core's record contradicts part of this reading: ${PROMOTED_FINDING}): ${GAP_AND_CHANGE_NO.changed}`);
    expect(advice).toContain(`Judge call 2 (no defect Core can find in this result): ${GAP_NO.changed}`);
    // Neither unmeasured claim stands; both readings remain ordered and explicitly unconfirmed.
    expect(advice.indexOf("Judge call 1")).toBeLessThan(advice.indexOf("Judge call 2"));
    expect(advice).not.toContain("contradicted by Core's record");
    expect(String(verdict.unconfirmedReading?.observed)).toContain(GAP_AND_CHANGE_NO.observed);
  });

  it("labels the one reading of two calls worded alike", async () => {
    const verdict = await judge(answering(no(GAP_AND_CHANGE_NO), no(GAP_AND_CHANGE_NO)))({ summary: campsiteRunSummary(), budget: { maxCostUsd: 0.2 } });
    expect(verdict).toMatchObject({ verdict: "unknown" });
    if (verdict.verdict !== "unknown") return;
    expect(String(verdict.unconfirmedReading?.advice)).toContain(GAP_AND_CHANGE_NO.changed);
  });

  it("leaves a no the record refutes nothing of as it was", async () => {
    const verdict = await judge(answering(no(GAP_NO), no(GAP_NO)))({ summary: campsiteRunSummary(), budget: { maxCostUsd: 0.2 } });
    expect(verdict).toMatchObject({ verdict: "unknown", unsupportedNo: true, unconfirmedReading: { advice: expect.stringContaining(GAP_NO.changed) } });
  });
});
