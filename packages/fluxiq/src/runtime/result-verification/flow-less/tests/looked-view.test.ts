// What looks found after the acts, as the judge is shown them (`../judged-summary.ts`, `looked`): through
// the real harness with a scripted provider, no model called. A look reaches what the judge model is
// sent and its question says what it is, a new look changes the digest, the view is bounded, and a
// credential-shaped line never leaves. The fixture is a parish hall's bookings, a kind of site no
// realistic scenario uses.
import { describe, expect, it } from "vitest";
import type { AutomationStudioAttemptAct } from "@fluxiq/contracts/automation";
import { automationStudioLlmRequestEvidenceRefusal, runAutomationStudioLlmHarness, type AutomationStudioLlmProvider, type AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import { automationStudioLlmTaskMessages } from "../../../llm/provider-task/index.ts";
import { automationStudioFlowLessJudge } from "../judge.ts";
import { AUTOMATION_STUDIO_FLOW_LESS_QUESTION } from "../question.ts";
import { automationStudioFlowLessSummaryDigest } from "../summary-digest.ts";
import type { AutomationStudioFlowLessSummary } from "../types.ts";

const USAGE = { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: 0.001 };
const BOOKED: AutomationStudioAttemptAct = { id: "act.1", what: "Booked the hall for the choir", where: "the bookings page", classes: ["create_new"], state: "landed" };
const LOOK = { where: "http://127.0.0.1:5000/bookings/13-may/", found: "1 match for \"choir\"\nt40 cell \"Choir practice, 7pm\" at the top" };
const SECRET = "sk-abcdef1234567890abcdef1234";

const summary = (looked: AutomationStudioFlowLessSummary["looked"]): AutomationStudioFlowLessSummary => ({
  instructions: "Book the hall for the choir on the first free Tuesday.",
  acts: [BOOKED],
  endView: { after: "end", view: { lines: ["Bookings: 3"] } },
  ...(looked ? { looked } : {})
});

function scripted(): { provider: AutomationStudioLlmProvider; seen: AutomationStudioLlmTaskRequest[] } {
  const seen: AutomationStudioLlmTaskRequest[] = [];
  return {
    seen,
    provider: {
      metadata: { provider: "mock", model: "debug-model" },
      estimateCostUsd: () => 0.001,
      runTask: async (request: AutomationStudioLlmTaskRequest) => {
        seen.push(request);
        return { response: { kind: "diagnosis", summary: "Judged.", diagnosis: { answersRequest: "unknown", observed: "No view shows the booking." } }, usage: USAGE } as Awaited<ReturnType<AutomationStudioLlmProvider["runTask"]>>;
      }
    }
  };
}

async function sentFor(looked: AutomationStudioFlowLessSummary["looked"]): Promise<AutomationStudioLlmTaskRequest> {
  const { provider, seen } = scripted();
  await automationStudioFlowLessJudge({ summary: summary(looked), provider, run: runAutomationStudioLlmHarness, projectId: "project-1", flowId: "flow-1", deniedEvidenceKeys: ["rawMarkup"] });
  return seen[0]!;
}

const lookedOf = (request: AutomationStudioLlmTaskRequest) => (request.context.resultSummary as unknown as { looked?: { where: string; found: string }[] }).looked;

describe("what looks found, as the judge is shown them", () => {
  it("reaches what the judge model is sent, and its question says what it is", async () => {
    const request = await sentFor([LOOK]);
    expect(lookedOf(request)).toEqual([LOOK]);
    expect(AUTOMATION_STUDIO_FLOW_LESS_QUESTION).toContain("looked lists what looks at the site found after the first lasting act");
    // A look is what was found whole, never a cut the judge must refuse to take as seen (run-mwbkuxqt-c57f42cb).
    expect(AUTOMATION_STUDIO_FLOW_LESS_QUESTION).toContain("each with where it was made and what was found there, whole, from the site itself");
    expect(AUTOMATION_STUDIO_FLOW_LESS_QUESTION).not.toContain("short cut");
    const user = automationStudioLlmTaskMessages(request).find((message) => message.role === "user")?.content ?? "";
    expect(user).toContain("Choir practice, 7pm");
    expect(user).toContain("looked lists what looks at the site found");
    expect(automationStudioLlmRequestEvidenceRefusal(request)).toBeUndefined();
  });

  it("is absent when nothing was looked at", async () => {
    expect(lookedOf(await sentFor(undefined))).toBeUndefined();
  });

  it("changes the digest when a new look is added, and not when nothing is", () => {
    const one = automationStudioFlowLessSummaryDigest(summary([LOOK]));
    expect(automationStudioFlowLessSummaryDigest(summary([{ ...LOOK }]))).toBe(one);
    expect(automationStudioFlowLessSummaryDigest(summary([LOOK, { where: LOOK.where, found: "2 matches for \"hall\"" }]))).not.toBe(one);
    expect(automationStudioFlowLessSummaryDigest(summary(undefined))).not.toBe(one);
  });

  it("shows the latest few, each cut short", async () => {
    const many = Array.from({ length: 10 }, (_, index) => ({ where: `http://127.0.0.1:5000/bookings/${index}/`, found: `${index} ${"word ".repeat(400)}` }));
    const shown = lookedOf(await sentFor(many))!;
    expect(shown).toHaveLength(6);
    expect(shown[0]!.where).toBe("http://127.0.0.1:5000/bookings/4/");
    for (const look of shown) expect([...look.found].length).toBeLessThanOrEqual(600);
  });

  it("never sends a credential-shaped line, and says something was withheld", async () => {
    const request = await sentFor([{ where: LOOK.where, found: `${LOOK.found}\nt41 field "Key" value ${SECRET}` }, { where: `http://127.0.0.1:5000/?key=${SECRET}`, found: "1 match" }]);
    const words = JSON.stringify(request.context.resultSummary);
    expect(words).not.toContain(SECRET);
    expect(words).not.toContain("sk-abcdef");
    expect(lookedOf(request)![0]!.found).toContain("Choir practice, 7pm");
    expect(lookedOf(request)![0]!.found).toContain("(withheld)");
    expect((request.context.resultSummary as unknown as { withheld: boolean }).withheld).toBe(true);
    expect(automationStudioLlmRequestEvidenceRefusal(request)).toBeUndefined();
  });
});
