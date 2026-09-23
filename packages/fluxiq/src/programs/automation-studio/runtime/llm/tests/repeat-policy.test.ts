// What counts as asking the same thing twice.
//
// The case that produced this file: a model presses a control, the domain
// refuses, and the model does the sensible thing and looks again. That look was
// being withheld as "already observed" because no mutation had applied, asking
// for it counted as a step without progress, and three of them ended the build
// `repeat_without_progress` -- one of the live campaign's largest single
// failure causes, and the thing that defeated a separate improvement to the
// detail carried in rejection messages.
//
// The guard the fix must not weaken is in the last test: an action repeated
// with nothing whatever having happened is still a repeat.
import { describe, expect, it, vi } from "vitest";
import { runAutomationStudioLlmEvidenceLoop } from "../evidence-loop.ts";

const tools = [
  { toolId: "inspect", description: "Look at the page.", inputSchema: { type: "object" }, effect: "observe" as const, repeatPolicy: "after_mutation" as const },
  { toolId: "press", description: "Press a control.", inputSchema: { type: "object" }, effect: "mutate" as const }
];
const stalled = () => new Error("stalled");

const look = (index: number) => ({ kind: "tool_call", callId: `call.look.${index}`, toolId: "inspect", input: {} });
const pressed = (index: number) => ({ kind: "tool_call", callId: `call.press.${index}`, toolId: "press", input: { target: `target.${index}` } });

/** A tool table whose press refuses, the way a domain refuses a stale handle. */
const refusing = async ({ toolId }: { toolId: string }) => toolId === "press"
  ? { kind: "llm_evidence_tool_execution" as const, evidence: { ok: false, code: "target_unobserved" }, effectApplied: false, resultCode: "web.action.rejected.target_unobserved" }
  : { page: "as it is" };

describe("looking again after being refused", () => {
  it("is offered, runs, and is not counted against the no-progress guard", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(look(1))
      .mockResolvedValueOnce(pressed(1))
      .mockResolvedValueOnce(look(2))
      .mockResolvedValueOnce(pressed(2))
      .mockResolvedValueOnce(look(3))
      .mockResolvedValueOnce({ kind: "complete", result: { ready: true } });
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, decide, maxIterations: 8, maxToolCalls: 8, unusableDecisions: { stalled }, executeTool: refusing
    });
    expect(result).toMatchObject({ ok: true, accounting: { iterations: 6, toolCalls: 5 } });
    // Every look after a refusal ran, and the observation was offered each time.
    expect(result.trace.filter((entry) => entry.toolId === "inspect").every((entry) => entry.callId !== undefined)).toBe(true);
    expect(decide.mock.calls[2]?.[0].tools.map((tool: { toolId: string }) => tool.toolId)).toEqual(["inspect", "press"]);
    expect(decide.mock.calls[4]?.[0].tools.map((tool: { toolId: string }) => tool.toolId)).toEqual(["inspect", "press"]);
  });

  it("does not let the same refused action be asked for again", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(pressed(1))
      .mockResolvedValueOnce(pressed(1))
      .mockResolvedValueOnce({ kind: "complete", result: { ready: true } });
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, decide, maxIterations: 8, maxToolCalls: 8, unusableDecisions: { stalled }, executeTool: refusing
    });
    // The second press is the same request over an unchanged world, so it is
    // answered from the first rather than run: a refusal moves what the model
    // knows, never what the action would do.
    expect(result).toMatchObject({ ok: true, accounting: { toolCalls: 1 } });
    expect(result.trace[1]).toMatchObject({ toolId: "press", resultCode: "llm_evidence_loop.already_answered" });
  });

  it("still ends a run that only repeats itself", async () => {
    const decide = vi.fn().mockResolvedValue(look(1));
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, decide, maxIterations: 8, maxToolCalls: 8, maxStepsWithoutProgress: 3, executeTool: refusing
    });
    expect(result).toMatchObject({ ok: false, code: "llm_evidence_loop.repeat_without_progress" });
  });
});
