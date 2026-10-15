// A build test's yes that lacked its quote and also said the Flow needs a change is held and rechecked, never taken as a
// no (t636). A replay of A8 social `run-mv9ml775-9872e63e` step 0131's shape on another kind of site
// (`../../value-readings/tests/tool-waitlist-fixture.ts`): the first call answered yes with `patchNeeded: true` without
// quoting the request beside a condition, and became a no with no reading, so two yeses over a correct result came out a
// split. Now its recheck's yes is taken, keeping the advice's code, and the two yeses finish the test. Both a candidate
// trial and a subflow trial ask this judge. No model is called; the provider is scripted.
import { describe, expect, it } from "vitest";
import type { AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import { WAITLIST_INSTRUCTION, WAITLIST_REQUEST, WAITLIST_YES, waitlistRunSummary } from "../../value-readings/tests/tool-waitlist-fixture.ts";
import { automationStudioBuildTestJudge, type AutomationStudioBuildTestTaskChecklist } from "../index.ts";

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

/** A yes that quotes the request beside neither condition and advises a change: Core holds it for the quote. */
const ADVISING_UNQUOTED = { ...WAITLIST_YES, patchNeeded: true, observed: WAITLIST_YES.observed.replace(/carries out "[^"]+"/gu, "is right"), changed: "Read the approved bookings by their status column." };

const SUBFLOW: AutomationStudioBuildTestTaskChecklist = {
  parts: [{ id: "p1", words: WAITLIST_REQUEST, goalFacts: [], lastingActs: [] }],
  notAsked: [],
  outOfScope: [{ id: "p2", words: "Email each approved member." }]
};

describe.each([
  { trial: "a candidate trial", taskChecklist: undefined },
  { trial: "a subflow trial", taskChecklist: SUBFLOW }
] as const)("$trial: a quote-lacking yes that advised a change, beside a yes", ({ taskChecklist }) => {
  const judge = (provider: AutomationStudioLlmProvider) =>
    automationStudioBuildTestJudge({ instructions: [WAITLIST_INSTRUCTION], deniedEvidenceKeys: [], projectId: "project-1", flowId: "flow-1", provider });

  it("is rechecked, not taken as a no: its recheck's yes and the other yes finish the test", async () => {
    const { provider, seen } = answering(ADVISING_UNQUOTED, WAITLIST_YES, WAITLIST_YES);
    const verdict = await judge(provider)({ summary: waitlistRunSummary(), taskChecklist, budget: { maxCostUsd: 0.2 } });
    expect(verdict).toMatchObject({ verdict: "yes" });
    expect(seen).toHaveLength(3);
    // The second ask of the first call was the exclusion-evidence recheck.
    expect(JSON.stringify(seen[1])).toContain("Your affirmative judgement lacked required exclusion evidence");
  });

  it("is held, never a no, when its recheck lacks the quote again", async () => {
    const { provider } = answering(ADVISING_UNQUOTED, ADVISING_UNQUOTED, WAITLIST_YES);
    const verdict = await judge(provider)({ summary: waitlistRunSummary(), taskChecklist, budget: { maxCostUsd: 0.2 } });
    expect(verdict.verdict).toBe("not_judged");
    // A yes that advised a change is no plain yes: the builder is not told the judges accepted the rows as they are.
    expect(verdict).not.toHaveProperty("yesUnconfirmed");
    // The builder is shown that a change was advised, the held yes's reading and the change it named (t636).
    expect(verdict).toMatchObject({ changeAdvised: true, answeredReading: { advice: ADVISING_UNQUOTED.changed } });
    expect(verdict.verdict === "not_judged" ? verdict.answeredReading?.observed : undefined).toContain("is right");
  });
});
