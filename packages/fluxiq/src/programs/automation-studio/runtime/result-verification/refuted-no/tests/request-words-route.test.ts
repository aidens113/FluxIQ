// A stub-judge replay of A8 bigbox `run-mv9dcztz-f16d6b5a` steps 0066-0072's
// shape (t629), through the build-test judge a candidate trial and a subflow
// trial both ask: the exact rows stored, a yes beside a no calling settled rows
// "missing qualifying rows", then two such nos on the retest. Each no is
// refuted by Core's record and asked once more; two yeses then confirm. No
// model is called; the provider is scripted.
//
// **And no ban on the exact revision.** A no Core's record still refutes on the
// re-ask is unknown, never a no. The candidate gate closes a digest -- so a
// resubmission is refused `candidate.unchanged_after_no` and a retest
// `candidate.trial_unchanged_after_no` -- only on a trial whose verdict is no
// (`../../../flow-bootstrap/candidate/trial-gate.ts`, `closedDigests`), and a
// subflow trial's gate the same way: the unknown below never reaches it.
import { describe, expect, it } from "vitest";
import type { AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import { automationStudioBuildTestJudge, type AutomationStudioBuildTestTaskChecklist } from "../../build-test/index.ts";
import {
  DROPPED_INCLUDING_NO, LIBRARY_YES, MISSING_LIST_NO, MISSING_QUALIFYING_NO, UNREAD_TITLE_NO
} from "./library-readings-fixture.ts";
import { LIBRARY_REQUEST, libraryInstruction, libraryRunSummary } from "./library-fixture.ts";

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
  automationStudioBuildTestJudge({ instructions: [libraryInstruction()], deniedEvidenceKeys: [], projectId: "project-1", flowId: "flow-1", provider });

/** A subflow trial's checklist: its one part, and another subflow's part out of its scope. */
const SUBFLOW: AutomationStudioBuildTestTaskChecklist = {
  parts: [{ id: "p1", words: LIBRARY_REQUEST, goalFacts: [], lastingActs: [] }],
  notAsked: [],
  outOfScope: [{ id: "p2", words: "Put a hold on the first title." }]
};

const TRIALS = [
  { trial: "a candidate trial", taskChecklist: undefined },
  { trial: "a subflow trial", taskChecklist: SUBFLOW }
] as const;

const RECORD_SAYS = "the request's own words \\\"Available to borrow today\\\"";

describe.each(TRIALS)("$trial: nos calling rows missing that a condition testing the request's own words left out", ({ taskChecklist }) => {
  it("step 0066: a yes beside such a no asks the no once more with Core's findings, and two yeses confirm", async () => {
    const { provider, seen } = answering(LIBRARY_YES, no(MISSING_QUALIFYING_NO), LIBRARY_YES);
    const verdict = await judge(provider)({ summary: libraryRunSummary(), taskChecklist, budget: { maxCostUsd: 0.2 } });
    expect(verdict).toMatchObject({ verdict: "yes" });
    expect(verdict.spent.calls).toBe(3);
    expect(JSON.stringify(seen[2])).toContain(RECORD_SAYS);
    expect(JSON.stringify(seen[1])).not.toContain(RECORD_SAYS);
  });

  it("step 0070: two such nos are each asked once more, and two yeses confirm", async () => {
    const { provider, seen } = answering(no(MISSING_LIST_NO), no(DROPPED_INCLUDING_NO), LIBRARY_YES, LIBRARY_YES);
    const verdict = await judge(provider)({ summary: libraryRunSummary(), taskChecklist, budget: { maxCostUsd: 0.2 } });
    expect(verdict).toMatchObject({ verdict: "yes" });
    expect(verdict.spent.calls).toBe(4);
    expect(JSON.stringify(seen[2])).toContain(RECORD_SAYS);
    expect(JSON.stringify(seen[3])).toContain(RECORD_SAYS);
  });

  it("the same nos again on the re-ask are unknown, never a no: nothing closes the exact revision", async () => {
    const { provider } = answering(no(MISSING_LIST_NO), no(DROPPED_INCLUDING_NO), no(MISSING_QUALIFYING_NO), no(MISSING_LIST_NO));
    const verdict = await judge(provider)({ summary: libraryRunSummary(), taskChecklist, budget: { maxCostUsd: 0.2 } });
    expect(verdict).toMatchObject({ verdict: "unknown", why: expect.stringContaining("contradicted by Core's own record") });
    expect(verdict.verdict).not.toBe("no");
  });

  it("a no naming a title the read left out without reading its value still stands: two are a no, asked nothing more", async () => {
    const { provider, seen } = answering(no(UNREAD_TITLE_NO), no(UNREAD_TITLE_NO), LIBRARY_YES, LIBRARY_YES);
    const verdict = await judge(provider)({ summary: libraryRunSummary({ unread: true }), taskChecklist, budget: { maxCostUsd: 0.2 } });
    expect(verdict).toMatchObject({ verdict: "no", observed: UNREAD_TITLE_NO.observed });
    expect(seen).toHaveLength(2);
  });
});
