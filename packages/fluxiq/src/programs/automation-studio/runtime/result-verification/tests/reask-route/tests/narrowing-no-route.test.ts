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
import { CAMPSITE_REQUEST, CAMP_OSPREY, CAMP_REGION, campsiteInstruction, campsiteRunSummary } from "../../../refuted-no/tests/campsite-fixture.ts";
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
  defects: [{ kind: "other", requestWords: "every campsite", row: "Region step" }],
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

  it("stays unsure where both refutation and support rechecks repeat the unmeasured no", async () => {
    const { provider } = answering(blaming("Lakeshore"), CAMPSITE_YES, blaming("Lakeshore"), blaming("Lakeshore"));
    const verdict = await judge(provider, REQUEST)({ summary: summary("Lakeshore"), budget: { maxCostUsd: 0.2 } });
    expect(verdict).toMatchObject({ verdict: "unknown" });
    // t771: the yes beside the refused no is asked once more; this judge answers nothing usable.
    expect(verdict.spent.calls).toBe(5);
  });

  it("rechecks an unmeasured region restriction even where the option is not the request's words", async () => {
    // Only the split's own re-ask (t725) asks it again, for a named defect, and it names the same no: the split stands.
    const { provider, seen } = answering(blaming("Riverside"), CAMPSITE_YES, blaming("Riverside"), blaming("Riverside"));
    const verdict = await judge(provider, REQUEST)({ summary: summary("Riverside"), budget: { maxCostUsd: 0.2 } });
    expect(verdict).toMatchObject({ verdict: "unknown" });
    // t771: the yes beside the refused no is asked once more; this judge answers nothing usable.
    expect(verdict.spent.calls).toBe(5);
    expect(seen).toHaveLength(5);
    expect(JSON.stringify(seen[2])).not.toContain("Core did not see the rows such a step removed");
    expect(JSON.stringify(seen[2])).toContain("Answer no only for a defect you name in this result");
  });

  // t690 (t686 "Not verified"): the verification never passed Core's record to this re-ask, so a reason the record
  // refutes beside the blame kept the no standing. Here the other reason calls a campsite the read left out stored.
  it("is asked once more where its only other reason is one Core's record refutes", async () => {
    const withMisread = { ...blaming("Lakeshore"), observed: `${blaming("Lakeshore").observed} Stored 4 rows including "${CAMP_OSPREY}", which is closed for the season.` };
    const { provider, seen } = answering(withMisread, CAMPSITE_YES, CAMPSITE_YES);
    const verdict = await judge(provider, REQUEST)({ summary: summary("Lakeshore"), budget: { maxCostUsd: 0.2 } });
    expect(verdict).toMatchObject({ verdict: "yes" });
    expect(verdict.spent.calls).toBe(3);
    expect(JSON.stringify(seen[2])).toContain("Core did not see the rows such a step removed");
  });
});
