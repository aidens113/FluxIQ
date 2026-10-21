// The rule that a no is only as good as what it names (t607) holds wherever a
// build's test is judged: a candidate trial and a subflow trial both ask the
// build-test judge (`../../build-test/judge.ts`), which asks the real check
// (`../../verify.ts`), whose agreement weighs each no against Core's record. A
// replay of A8 everything-store `run-mv8p0p7c-c8412344` whole test 2's shape:
// two calls, the same no, two distinct stored rows called one. No model is
// called; the provider is scripted.
import { describe, expect, it } from "vitest";
import type { AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import { automationStudioBuildTestJudge, type AutomationStudioBuildTestTaskChecklist } from "../../build-test/index.ts";
import { LAMP_CLAMP, LAMP_SHADE, LAMPS_INSTRUCTION, LAMPS_REQUEST, SAME_LAMP_NO, lampsRunSummary } from "./lamps-fixture.ts";

const USAGE = { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: 0.001 };
const NO = { answersRequest: "no", ...SAME_LAMP_NO, defects: [] };
const YES = {
  answersRequest: "yes",
  expected: SAME_LAMP_NO.expected,
  observed: `Condition 1 (sponsored is absent) follows "Leave out sponsored listings". Condition 2 (rating atLeast 4) follows "rated 4 or higher". "${LAMP_SHADE}" is left out as "spare parts such as spare bulbs or lamp shades" says.`
};
const REAL_DEFECT = { answersRequest: "no", defects: [{ kind: "kept_not_asked", row: LAMP_CLAMP.name, requestWords: "desk lamps" }], expected: SAME_LAMP_NO.expected, observed: `"${LAMP_CLAMP.name}" (LMP2B6N4C8) is a clamp lamp, not a desk lamp, and the request does not ask for it.`, changed: "Leave out clamp lamps." };

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
  automationStudioBuildTestJudge({ instructions: [LAMPS_INSTRUCTION], deniedEvidenceKeys: [], projectId: "project-1", flowId: "flow-1", provider });

/** A subflow trial's checklist: its one part, and another subflow's part out of its scope. */
const SUBFLOW: AutomationStudioBuildTestTaskChecklist = {
  parts: [{ id: "p1", words: LAMPS_REQUEST, goalFacts: [], lastingActs: [] }],
  notAsked: [],
  outOfScope: [{ id: "p2", words: "Save the list to the lighting sheet." }]
};

const TRIALS = [
  { trial: "a candidate trial", taskChecklist: undefined },
  { trial: "a subflow trial", taskChecklist: SUBFLOW }
] as const;

describe.each(TRIALS)("$trial: two noes calling two distinct stored rows one", ({ taskChecklist }) => {
  it("is asked again, each call once, with Core's findings; two yeses then pass, never a bare no", async () => {
    const { provider, seen } = answering(NO, NO, YES, YES);
    const verdict = await judge(provider)({ summary: lampsRunSummary(), taskChecklist, budget: { maxCostUsd: 0.2 } });
    expect(verdict).toMatchObject({ verdict: "yes" });
    expect(verdict.spent.calls).toBe(4);
    // Each re-ask's copy carries Core's measurement; the first two calls' did not.
    expect(JSON.stringify(seen[2])).toContain("Core's record: Core stored");
    expect(JSON.stringify(seen[3])).toContain("Core's record: Core stored");
    expect(JSON.stringify(seen[0])).not.toContain("Core's record: Core stored");
  });

  it("asked again, the same claim twice more is unknown, saying Core's record contradicts it, never a no", async () => {
    const { provider } = answering(NO, NO, NO, NO);
    const verdict = await judge(provider)({ summary: lampsRunSummary(), taskChecklist, budget: { maxCostUsd: 0.2 } });
    expect(verdict).toMatchObject({ verdict: "unknown", why: expect.stringContaining("contradicted by Core's own record") });
    expect(verdict.verdict).not.toBe("no");
  });

  it("a no naming a defect Core cannot refute still stands: two of them are a no, asked nothing more", async () => {
    const { provider, seen } = answering(REAL_DEFECT, REAL_DEFECT, YES, YES);
    const verdict = await judge(provider)({ summary: lampsRunSummary(), taskChecklist, budget: { maxCostUsd: 0.2 } });
    expect(verdict).toMatchObject({ verdict: "no", observed: REAL_DEFECT.observed });
    expect(seen).toHaveLength(2);
  });
});
