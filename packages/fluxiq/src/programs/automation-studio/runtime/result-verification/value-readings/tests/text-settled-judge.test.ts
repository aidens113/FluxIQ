// A yes over an exact answer is confirmed when the rows a text test alone left
// out are ones Core settled (t624). A replay of A8 bigbox
// `run-mv96rz6d-745e2940` step 0051's shape on another kind of site: the
// trial stored exactly the rows asked for, a text test of a column the answer
// does not store left out three rows, each witnessed with the value it failed
// on, and every yes quoted the request once beside each condition without
// naming those rows one by one. Each yes was held, and the exact Flow never
// passed. Both a candidate trial and a subflow trial ask this judge
// (`../../build-test/judge.ts`). No model is called; the provider is scripted.
import { describe, expect, it } from "vitest";
import type { AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import { automationStudioBuildTestJudge, type AutomationStudioBuildTestTaskChecklist } from "../../build-test/index.ts";
import {
  AUDIOBOOKS_INSTRUCTION, AUDIOBOOKS_LOW_RATED, AUDIOBOOKS_NOT_ON_SHELF, AUDIOBOOKS_PROMOTED, AUDIOBOOKS_REQUEST, AUDIOBOOKS_SAMPLER, AUDIOBOOKS_YES, audiobooksRunSummary
} from "./audiobooks-fixture.ts";

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
  automationStudioBuildTestJudge({ instructions: [AUDIOBOOKS_INSTRUCTION], deniedEvidenceKeys: [], projectId: "project-1", flowId: "flow-1", provider });

const SUBFLOW: AutomationStudioBuildTestTaskChecklist = {
  parts: [{ id: "p1", words: AUDIOBOOKS_REQUEST, goalFacts: [], lastingActs: [] }],
  notAsked: [],
  outOfScope: [{ id: "p2", words: "Place a hold on the first title." }]
};

const TRIALS = [
  { trial: "a candidate trial", taskChecklist: undefined },
  { trial: "a subflow trial", taskChecklist: SUBFLOW }
] as const;

describe("the read's account settles a text test's rows by their witnesses", () => {
  it("settles each row the shelf test left out, and the negated title test's row, beside the bound's and the presence test's", () => {
    const conditions = audiobooksRunSummary().reads![0]!.conditions!;
    expect(conditions.map((entry) => entry.leftOutSettled)).toEqual([
      AUDIOBOOKS_PROMOTED,
      AUDIOBOOKS_NOT_ON_SHELF.map(([title]) => title),
      [`${AUDIOBOOKS_LOW_RATED} — rating: 3.7`],
      [AUDIOBOOKS_SAMPLER]
    ]);
    expect(conditions[1]!.settled).toContain("each fails it, so Core settled these rows");
  });

  it("settles none of the text tests' rows when the read sent no witness", () => {
    const conditions = audiobooksRunSummary(false).reads![0]!.conditions!;
    expect(conditions[1]!.leftOutSettled).toBeUndefined();
    expect(conditions[3]!.leftOutSettled).toBeUndefined();
  });
});

describe.each(TRIALS)("$trial: two yeses over an exact answer whose text test left rows out", ({ taskChecklist }) => {
  it("are confirmed: the yes quoted the request once beside each condition, and Core settled the rows", async () => {
    const { provider, seen } = answering(AUDIOBOOKS_YES, AUDIOBOOKS_YES);
    const verdict = await judge(provider)({ summary: audiobooksRunSummary(), taskChecklist, budget: { maxCostUsd: 0.2 } });
    expect(verdict).toMatchObject({ verdict: "yes" });
    expect(verdict.spent.calls).toBe(2);
    // The judge was shown the settled rows; the left-out copies of stored items are settled too, so their
    // condition's own settled accounts for them and they are not listed again as in the result (live-lane-1 fix 4).
    const shown = JSON.stringify(seen[0]);
    expect(shown).toContain("leftOutSettled");
    expect(shown).not.toContain("leftOutAlsoInResult");
  });

  it("without the witnesses the same yes is held, as it was before: the rows were never settled", async () => {
    const { provider } = answering(AUDIOBOOKS_YES);
    const verdict = await judge(provider)({ summary: audiobooksRunSummary(false), taskChecklist, budget: { maxCostUsd: 0.2 } });
    expect(verdict.verdict).not.toBe("yes");
  });

  it("still holds a yes that never quotes the request beside the text test: the condition must be the request's", async () => {
    // Each condition on a line of its own, so no quote beside another condition is lent to the shelf test's.
    const unquoted = { ...AUDIOBOOKS_YES, observed: AUDIOBOOKS_YES.observed.replace("carries out \"my branch has on the shelf today\"", "is fine").replace(/ (?=Condition \d)/gu, "\n") };
    const { provider } = answering(unquoted);
    const verdict = await judge(provider)({ summary: audiobooksRunSummary(), taskChecklist, budget: { maxCostUsd: 0.2 } });
    expect(verdict.verdict).not.toBe("yes");
  });
});
