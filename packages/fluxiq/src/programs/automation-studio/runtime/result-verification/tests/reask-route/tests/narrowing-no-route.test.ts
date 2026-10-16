// A stub-judge replay of A8 frozen pair 8 candidate towels
// `run-mvam0lys-2d3eb090` 0064 (t666) through the build-test judge and the
// verification it asks (`../../../verify.ts`): a no blaming a step that chose the
// request's own words is asked once more beside a yes, and two yeses then
// confirm; a no blaming a step whose option is not the request's words stands
// as a split. On the campsite search of `../../../refuted-no/tests/campsite-fixture.ts`,
// with a region step before the read: no task, site, item or answer of any
// realistic scenario. No model is called; the provider is scripted.
import { describe, expect, it } from "vitest";
import type { AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest } from "../../../../llm/index.ts";
import { automationStudioBuildTestJudge } from "../../../build-test/index.ts";
import type { AutomationStudioRunResultSummary } from "../../../contracts/index.ts";
import { CAMPSITE_REQUEST, CAMP_REGION, campsiteInstruction, campsiteRunSummary } from "../../../refuted-no/tests/campsite-fixture.ts";
import { CAMPSITE_YES } from "../../../refuted-no/tests/campsite-readings-fixture.ts";

const USAGE = { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: 0.001 };
/** The request, naming the region the step chooses in its own words. */
const REQUEST = CAMPSITE_REQUEST.replace("every campsite in the park service's search results", "every campsite in the Lakeshore region of the park service's search results");

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

/** The campsite run with the region step's record before the read: it chose `chose` in "Region", 40 results to 14. */
function summary(chose: string): AutomationStudioRunResultSummary {
  const run = campsiteRunSummary();
  return { ...run, reads: run.reads!.map((read) => ({ ...read, narrowedBefore: [{ nodeId: CAMP_REGION, label: `choose the ${chose} region`, effect: "same_page" as const, group: "Region", chose, addedChoice: true, resultCount: { before: 40, after: 14 } }] })) };
}

/** 0064's shape: the step before the read keeps less than the request asks, so remove it. */
const blaming = (chose: string) => ({
  answersRequest: "no",
  expected: "Every campsite the request asks for.",
  observed: `The region step at ${CAMP_REGION} chose ${chose}, which narrows the list to fewer campsites than the request asks for.`,
  changed: `Remove the region step ${CAMP_REGION} so the read runs over every campsite.`
});

const judge = (provider: AutomationStudioLlmProvider, request: string) =>
  automationStudioBuildTestJudge({ instructions: [campsiteInstruction(request)], deniedEvidenceKeys: [], projectId: "project-1", flowId: "flow-1", provider });

describe("a no blaming a step that chose the request's own words, through the verification (t666)", () => {
  it("is asked once more beside a yes, with Core's record of the step, and two yeses confirm", async () => {
    const { provider, seen } = answering(blaming("Lakeshore"), CAMPSITE_YES, CAMPSITE_YES);
    const verdict = await judge(provider, REQUEST)({ summary: summary("Lakeshore"), budget: { maxCostUsd: 0.2 } });
    expect(verdict).toMatchObject({ verdict: "yes" });
    expect(verdict.spent.calls).toBe(3);
    const recheck = JSON.stringify(seen[2]);
    expect(recheck).toContain("chose \\\"Lakeshore\\\" in \\\"Region\\\", and the request itself says \\\"Lakeshore\\\"");
    expect(recheck).toContain("Core did not see the rows such a step removed");
    expect(JSON.stringify(seen[1])).not.toContain("Core did not see the rows such a step removed");
  });

  it("stays a split where the re-asked call says no again, asked only once", async () => {
    const { provider } = answering(blaming("Lakeshore"), CAMPSITE_YES, blaming("Lakeshore"), CAMPSITE_YES);
    const verdict = await judge(provider, REQUEST)({ summary: summary("Lakeshore"), budget: { maxCostUsd: 0.2 } });
    expect(verdict).toMatchObject({ verdict: "unknown" });
    expect(verdict.spent.calls).toBe(3);
  });

  it("is not asked again where the step's option is not the request's words", async () => {
    const { provider, seen } = answering(blaming("Riverside"), CAMPSITE_YES, CAMPSITE_YES);
    const verdict = await judge(provider, REQUEST)({ summary: summary("Riverside"), budget: { maxCostUsd: 0.2 } });
    expect(verdict).toMatchObject({ verdict: "unknown" });
    expect(verdict.spent.calls).toBe(2);
    expect(seen).toHaveLength(2);
  });
});
