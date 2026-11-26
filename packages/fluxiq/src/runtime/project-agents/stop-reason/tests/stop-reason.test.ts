import { describe, expect, it } from "vitest";
import type { AutomationStudioLlmEvidenceLoopResult } from "../../../llm/evidence-loop.ts";
import { automationStudioProjectSupervisorStopReason } from "../index.ts";

const failed = (code: string, extra: Record<string, unknown> = {}): AutomationStudioLlmEvidenceLoopResult => ({ ok: false, code, trace: [], steps: [], accounting: {}, ...extra }) as unknown as AutomationStudioLlmEvidenceLoopResult;
const OPENING = "The supervisor stopped before a whole trial passed: ";
const noCode = (reason: string) => expect(reason).not.toMatch(/llm_evidence_loop|llm evidence loop|_/);

describe("the supervisor's stop reason", () => {
  // No count of unreadable replies ends a loop (t1056): the budget does, and says what it last went on.
  it("says the budget ran out, and that its last replies arrived unreadable where they did", () => {
    const exhaustion = { bound: "budget", budgetBound: "cost" };
    const reason = automationStudioProjectSupervisorStopReason({ loop: failed("llm_evidence_loop.iteration_limit", { exhaustion, unreadable: { inARow: 6, total: 7, cases: [], said: "" } }) });
    expect(reason).toBe(`${OPENING}the budget for the AI model's decisions ran out, its last 6 replies from the AI model arriving unreadable.`);
    expect(automationStudioProjectSupervisorStopReason({ loop: failed("llm_evidence_loop.iteration_limit", { exhaustion }) })).toBe(`${OPENING}the budget for the AI model's decisions ran out.`);
  });

  // Only a budget runs out (t1056): no count of turns ends a loop, so a loop's exhaustion is always said as its budget.
  it("says the no-progress guard and the budget that ran out", () => {
    expect(automationStudioProjectSupervisorStopReason({ loop: failed("llm_evidence_loop.repeat_without_progress") })).toBe(`${OPENING}the AI model kept repeating itself without making any progress.`);
    const spent = { bound: "budget", iterations: 40, draftSteps: 0, proposableSteps: 0 };
    expect(automationStudioProjectSupervisorStopReason({ loop: failed("llm_evidence_loop.iteration_limit", { exhaustion: spent }) })).toContain("the budget for the AI model's decisions ran out.");
    expect(automationStudioProjectSupervisorStopReason({ loop: failed("llm_evidence_loop.iteration_limit", { exhaustion: spent }) })).not.toContain("decisions it was allowed");
    expect(automationStudioProjectSupervisorStopReason({ loop: failed("llm_evidence_loop.iteration_limit") })).toContain("the budget for the AI model's decisions ran out.");
  });

  it("says a guard's stall by its issue code, and a generic sentence for one it does not know", () => {
    expect(automationStudioProjectSupervisorStopReason({ stalledOn: ["llm_evidence_loop.repeat_refused"] })).toContain("already been refused.");
    expect(automationStudioProjectSupervisorStopReason({ stalledOn: ["project.some_new_code"] })).toBe(`${OPENING}its decisions kept being refused without making any progress.`);
  });

  it("never shows a code it does not know", () => {
    const reasons = [
      automationStudioProjectSupervisorStopReason({ loop: failed("llm_evidence_loop.something_new") }),
      automationStudioProjectSupervisorStopReason({ stalledOn: ["llm_evidence_loop.something_new"] }),
      automationStudioProjectSupervisorStopReason({})
    ];
    for (const reason of reasons) {
      expect(reason.startsWith(OPENING)).toBe(true);
      noCode(reason);
    }
  });

  it("never names a code for any loop ending it knows", () => {
    for (const code of ["invalid_configuration", "invalid_decision", "unknown_tool", "duplicate_call", "duplicate_tool_request", "tool_failed", "evidence_limit", "cancelled", "provider_unavailable"]) {
      noCode(automationStudioProjectSupervisorStopReason({ loop: failed(`llm_evidence_loop.${code}`) }));
    }
  });
});
