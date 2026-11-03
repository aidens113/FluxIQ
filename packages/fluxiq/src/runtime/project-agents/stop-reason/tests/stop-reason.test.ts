import { describe, expect, it } from "vitest";
import type { AutomationStudioLlmEvidenceLoopResult } from "../../../llm/evidence-loop.ts";
import { automationStudioProjectSupervisorStopReason } from "../index.ts";

const failed = (code: string, extra: Record<string, unknown> = {}): AutomationStudioLlmEvidenceLoopResult => ({ ok: false, code, trace: [], steps: [], accounting: {}, ...extra }) as unknown as AutomationStudioLlmEvidenceLoopResult;
const OPENING = "The supervisor stopped before a whole trial passed: ";
const noCode = (reason: string) => expect(reason).not.toMatch(/llm_evidence_loop|llm evidence loop|_/);

describe("the supervisor's stop reason", () => {
  it("says unreadable replies with the run's own count", () => {
    const reason = automationStudioProjectSupervisorStopReason({ loop: failed("llm_evidence_loop.unreadable_replies", { unreadable: { inARow: 6, total: 7, cases: [], said: "" } }) });
    expect(reason).toBe(`${OPENING}the AI model's replies could not be read six times in a row.`);
  });

  it("says unreadable replies without a count when the result carries none", () => {
    expect(automationStudioProjectSupervisorStopReason({ loop: failed("llm_evidence_loop.unreadable_replies") })).toBe(`${OPENING}the AI model's replies kept arriving unreadable.`);
  });

  it("says the no-progress guard and the turns that ran out", () => {
    expect(automationStudioProjectSupervisorStopReason({ loop: failed("llm_evidence_loop.repeat_without_progress") })).toBe(`${OPENING}the AI model kept repeating itself without making any progress.`);
    const turns = { bound: "iterations", maxIterations: 40, iterations: 40, draftSteps: 0, proposableSteps: 0 };
    expect(automationStudioProjectSupervisorStopReason({ loop: failed("llm_evidence_loop.iteration_limit", { exhaustion: turns }) })).toContain("it used all 40 of the decisions it was allowed.");
    expect(automationStudioProjectSupervisorStopReason({ loop: failed("llm_evidence_loop.iteration_limit", { exhaustion: { ...turns, bound: "budget" } }) })).toContain("the budget for the AI model's decisions ran out.");
    expect(automationStudioProjectSupervisorStopReason({ loop: failed("llm_evidence_loop.iteration_limit") })).toContain("it ran out of turns.");
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
