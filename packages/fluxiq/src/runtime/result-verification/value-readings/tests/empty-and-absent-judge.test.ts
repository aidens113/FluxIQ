// A yes over an exact answer is confirmed when the rows a bound left out with
// no value, and the rows a text test left out whose witness found no value,
// are ones Core settled (t636). A replay of A8 social `run-mv9ml775-9872e63e`
// steps 0208 and 0214's shape on another kind of site
// (`./tool-waitlist-fixture.ts`): both trials stored exactly the rows asked
// for, and 8 yeses out of 8 were held because neither kind of row was settled.
// Both a candidate trial and a subflow trial ask this judge
// (`../../build-test/judge.ts`). No model is called; the provider is scripted.
import { describe, expect, it } from "vitest";
import type { AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import { automationStudioBuildTestJudge, type AutomationStudioBuildTestTaskChecklist } from "../../build-test/index.ts";
import { WAITLIST_EMPTY, WAITLIST_FEW, WAITLIST_INSTRUCTION, WAITLIST_REQUEST, WAITLIST_YES, waitlistRunSummary } from "./tool-waitlist-fixture.ts";

const USAGE = { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: 0.001 };

/** A provider answering each call with its own diagnosis, keeping every request it was sent. */
function answering(...diagnoses: Record<string, unknown>[]): { provider: AutomationStudioLlmProvider; seen: AutomationStudioLlmTaskRequest[] } {
  const seen: AutomationStudioLlmTaskRequest[] = [];
  return {
    seen,
    provider: {
      metadata: { provider: "mock", model: "debug-model" },
      runTask: async (request) => {
        const diagnosis = diagnoses[seen.length] ?? diagnoses[diagnoses.length - 1] ?? {};
        seen.push(request);
        return { response: { kind: "diagnosis", summary: "Judged.", diagnosis }, usage: USAGE };
      }
    }
  };
}

const judge = (provider: AutomationStudioLlmProvider) =>
  automationStudioBuildTestJudge({ instructions: [WAITLIST_INSTRUCTION], deniedEvidenceKeys: [], projectId: "project-1", flowId: "flow-1", provider });

const SUBFLOW: AutomationStudioBuildTestTaskChecklist = {
  parts: [{ id: "p1", words: WAITLIST_REQUEST, goalFacts: [], lastingActs: [] }],
  notAsked: [],
  outOfScope: [{ id: "p2", words: "Email each approved member." }]
};

const TRIALS = [
  { trial: "a candidate trial", taskChecklist: undefined },
  { trial: "a subflow trial", taskChecklist: SUBFLOW }
] as const;

describe("the reads' accounts settle a bound's empty row and a text test's absent rows", () => {
  it("settles the empty row beside the numbers that fail the bound, and every row the approval text was not found on", () => {
    const [eligible, approved] = waitlistRunSummary().reads!;
    const bound = eligible!.conditions![0]!;
    expect(bound.leftOutSettled).toEqual([...WAITLIST_FEW.slice(0, 2).map(([member, sessions]) => `${member} — sessions: ${sessions}`), `${WAITLIST_EMPTY} — sessions: (no value)`]);
    expect(bound.settled).toContain("where the read found no sessions, a row with no number fails every bound");
    const text = approved!.conditions![0]!;
    expect(text.leftOutSettled).toEqual(WAITLIST_FEW.map(([member]) => member));
    expect(text.settled).toContain("the read found no value to test");
  });
});

describe.each(TRIALS)("$trial: two yeses over an exact answer with an empty-bound row and absent-text rows", ({ taskChecklist }) => {
  it("are confirmed without a quote beside each of those rows: the yes quoted the request once per condition", async () => {
    const { provider, seen } = answering(WAITLIST_YES, WAITLIST_YES);
    const verdict = await judge(provider)({ summary: waitlistRunSummary(), taskChecklist, budget: { maxCostUsd: 0.2 } });
    expect(verdict).toMatchObject({ verdict: "yes" });
    expect(verdict.spent.calls).toBe(2);
    expect(JSON.stringify(seen[0])).toContain("leftOutSettled");
  });

  it("still holds a yes that quotes the request for neither condition: each condition must be the request's", async () => {
    const unquoted = { ...WAITLIST_YES, observed: WAITLIST_YES.observed.replace(/carries out "[^"]+"/gu, "is fine") };
    const { provider } = answering(unquoted);
    const verdict = await judge(provider)({ summary: waitlistRunSummary(), taskChecklist, budget: { maxCostUsd: 0.2 } });
    expect(verdict.verdict).not.toBe("yes");
  });
});
