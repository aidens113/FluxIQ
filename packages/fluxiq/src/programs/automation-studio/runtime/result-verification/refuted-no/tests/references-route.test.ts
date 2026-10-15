// A stub-judge replay of A8 wave 8's exact revisions (t631, bigbox
// `run-mv9gbsm5-2957581c` trials 0051, 0084 and 0108), through the build-test
// judge a candidate trial and a subflow trial both ask: the exact rows stored,
// and nos asking to drop conditions that left out nothing the request asks
// for, or saying a condition testing the request's own words "dropped rows ...
// which the request does not exclude". Each no is refuted by what it
// references -- the conditions its advice changes, the rows it names -- asked
// once more, and two yeses then confirm the exact Flow. A no still refuted on
// the re-ask is unknown, never a no, so nothing closes the exact revision. A no
// naming a row the read wrongly left out stands. No model is called; the
// provider is scripted.
import { describe, expect, it } from "vitest";
import type { AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import { automationStudioBuildTestJudge, type AutomationStudioBuildTestTaskChecklist } from "../../build-test/index.ts";
import { CAMPSITE_REQUEST, campsiteInstruction, campsiteRunSummary } from "./campsite-fixture.ts";
import { CAMPSITE_YES, DROP_NAME_CONDITIONS_NO, DROPPED_NOT_EXCLUDED_NO, RELAX_ONE_CONDITION_NO, WRONGLY_LEFT_OUT_NO } from "./campsite-readings-fixture.ts";

const USAGE = { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: 0.001 };
const no = (reading: Record<string, string>) => ({ answersRequest: "no", ...reading });

/** A provider answering each call with its own diagnosis, keeping every request it was sent. */
function answering(...diagnoses: Record<string, unknown>[]): { provider: AutomationStudioLlmProvider; seen: AutomationStudioLlmTaskRequest[] } {
  const seen: AutomationStudioLlmTaskRequest[] = [];
  return {
    seen,
    provider: {
      metadata: { provider: "mock", model: "debug-model" },
      runTask: async (request) => {
        const diagnosis = diagnoses[seen.length] ?? {};
        seen.push(request);
        return { response: { kind: "diagnosis", summary: "Judged.", diagnosis }, usage: USAGE };
      }
    }
  };
}

const judge = (provider: AutomationStudioLlmProvider) =>
  automationStudioBuildTestJudge({ instructions: [campsiteInstruction()], deniedEvidenceKeys: [], projectId: "project-1", flowId: "flow-1", provider });

/** A subflow trial's checklist: its one part, and another subflow's part out of its scope. */
const SUBFLOW: AutomationStudioBuildTestTaskChecklist = {
  parts: [{ id: "p1", words: CAMPSITE_REQUEST, goalFacts: [], lastingActs: [] }],
  notAsked: [],
  outOfScope: [{ id: "p2", words: "Reserve the first campsite for Saturday night." }]
};

const TRIALS = [
  { trial: "a candidate trial", taskChecklist: undefined },
  { trial: "a subflow trial", taskChecklist: SUBFLOW }
] as const;

/** Core's finding on the name conditions, as the re-ask's copy carries it. */
const NAME_FINDING = "left out no row by itself";
/** Core's finding on the availability condition's rows, as the re-ask's copy carries it. */
const ROWS_FINDING = "that condition tests the request's own words \\\"Open this weekend\\\"";

describe.each(TRIALS)("$trial: nos refuted by what they reference", ({ taskChecklist }) => {
  it("trial 0051: a yes beside a no asking to drop conditions that left out no row asks the no once more, and two yeses confirm", async () => {
    const { provider, seen } = answering(CAMPSITE_YES, no(DROP_NAME_CONDITIONS_NO), CAMPSITE_YES);
    const verdict = await judge(provider)({ summary: campsiteRunSummary(), taskChecklist, budget: { maxCostUsd: 0.2 } });
    expect(verdict).toMatchObject({ verdict: "yes" });
    expect(verdict.spent.calls).toBe(3);
    expect(JSON.stringify(seen[2])).toContain(NAME_FINDING);
    expect(JSON.stringify(seen[1])).not.toContain(NAME_FINDING);
  });

  it("trial 0084: two such nos are each asked once more, and two yeses confirm", async () => {
    const { provider, seen } = answering(no(RELAX_ONE_CONDITION_NO), no(DROP_NAME_CONDITIONS_NO), CAMPSITE_YES, CAMPSITE_YES);
    const verdict = await judge(provider)({ summary: campsiteRunSummary(), taskChecklist, budget: { maxCostUsd: 0.2 } });
    expect(verdict).toMatchObject({ verdict: "yes" });
    expect(verdict.spent.calls).toBe(4);
    expect(JSON.stringify(seen[2])).toContain(NAME_FINDING);
    expect(JSON.stringify(seen[3])).toContain(NAME_FINDING);
  });

  it("trial 0108: nos saying the condition dropped rows the request does not exclude are refuted by the rows they name, and two yeses confirm", async () => {
    const { provider, seen } = answering(no(DROPPED_NOT_EXCLUDED_NO), no(DROPPED_NOT_EXCLUDED_NO), CAMPSITE_YES, CAMPSITE_YES);
    const verdict = await judge(provider)({ summary: campsiteRunSummary(), taskChecklist, budget: { maxCostUsd: 0.2 } });
    expect(verdict).toMatchObject({ verdict: "yes" });
    expect(JSON.stringify(seen[2])).toContain(ROWS_FINDING);
  });

  it("the same nos again on the re-ask are unknown, never a no: nothing closes the exact revision", async () => {
    const { provider } = answering(no(RELAX_ONE_CONDITION_NO), no(DROPPED_NOT_EXCLUDED_NO), no(DROP_NAME_CONDITIONS_NO), no(DROPPED_NOT_EXCLUDED_NO));
    const verdict = await judge(provider)({ summary: campsiteRunSummary(), taskChecklist, budget: { maxCostUsd: 0.2 } });
    expect(verdict).toMatchObject({ verdict: "unknown", why: expect.stringContaining("contradicted by Core's own record") });
    expect(verdict.verdict).not.toBe("no");
  });

  it("nos asking to drop two conditions that may have left out a campsite together still stand: two are a no, asked nothing more", async () => {
    const { provider, seen } = answering(no(DROP_NAME_CONDITIONS_NO), no(DROP_NAME_CONDITIONS_NO), CAMPSITE_YES, CAMPSITE_YES);
    const verdict = await judge(provider)({ summary: campsiteRunSummary({ together: true }), taskChecklist, budget: { maxCostUsd: 0.2 } });
    expect(verdict).toMatchObject({ verdict: "no" });
    expect(seen).toHaveLength(2);
  });

  it("a no naming a campsite the read wrongly left out still stands: two are a no, asked nothing more", async () => {
    const { provider, seen } = answering(no(WRONGLY_LEFT_OUT_NO), no(WRONGLY_LEFT_OUT_NO), CAMPSITE_YES, CAMPSITE_YES);
    const verdict = await judge(provider)({ summary: campsiteRunSummary({ nameDrops: true }), taskChecklist, budget: { maxCostUsd: 0.2 } });
    expect(verdict).toMatchObject({ verdict: "no", observed: WRONGLY_LEFT_OUT_NO.observed });
    expect(seen).toHaveLength(2);
  });
});
