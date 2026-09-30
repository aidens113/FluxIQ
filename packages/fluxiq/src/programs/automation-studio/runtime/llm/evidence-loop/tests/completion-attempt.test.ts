// One attempt to finish, asked of the caller's check and the draft's dry run
// together. The dry run used to wait for the check to pass, which is how a
// build learned at decision 27 what was already true at 24.

import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { automationStudioLlmEvidenceCompletionAttempt } from "../completion-attempt.ts";
import { runAutomationStudioLlmEvidenceLoop } from "../../evidence-loop.ts";

const steps: AutomationStudioFlowDraftStep[] = [
  { position: 1, iteration: 1, callId: "call.1", actionId: "press", input: { target: "a" }, effect: "mutate", effectApplied: true, disposition: "kept" }
];
const refusal = (...issueCodes: string[]) => ({ ok: false as const, issueCodes, feedback: { code: "completion_refused", issues: issueCodes } });
const answerability = { recordsRequested: true, recordProducerPresent: false, recordStorePresent: false, issueCode: "bootstrap.cannot_answer_instruction" as const };

describe("one attempt to finish", () => {
  it("is accepted when the check passes and the draft replays clean, carrying what the check observed", async () => {
    const dryRun = vi.fn(async () => undefined);
    await expect(automationStudioLlmEvidenceCompletionAttempt({ result: { plan: true }, steps, checkCompletion: () => ({ ok: true, answerability: { recordsRequested: true, recordProducerPresent: false, recordStorePresent: false } }), dryRun }))
      .resolves.toEqual({ kind: "accepted", answerability: { recordsRequested: true, recordProducerPresent: false, recordStorePresent: false } });
    expect(dryRun).toHaveBeenCalledTimes(1);
  });

  it("is accepted with no check at all when the draft replays clean", async () => {
    await expect(automationStudioLlmEvidenceCompletionAttempt({ result: {}, steps, dryRun: async () => undefined })).resolves.toEqual({ kind: "accepted" });
  });

  it("replays the draft even when the check refused, and reports both refusals at once, the check's first", async () => {
    const dryRun = vi.fn(async () => ({ issueCodes: ["dry_run.step_failed", "check.one"] }));
    const attempt = await automationStudioLlmEvidenceCompletionAttempt({ result: {}, steps, checkCompletion: () => ({ ...refusal("check.one", "check.two"), answerability }), dryRun });

    expect(dryRun).toHaveBeenCalledTimes(1);
    // One code once, whichever of the two raised it.
    expect(attempt).toEqual({
      kind: "refused",
      issueCodes: ["check.one", "check.two", "dry_run.step_failed"],
      feedback: { code: "completion_refused", issues: ["check.one", "check.two"] },
      answerability
    });
  });

  it("is refused by the dry run alone, with no feedback of the check's, when the check passed", async () => {
    await expect(automationStudioLlmEvidenceCompletionAttempt({ result: {}, steps, checkCompletion: () => ({ ok: true }), dryRun: async () => ({ issueCodes: ["dry_run.step_failed"] }) }))
      .resolves.toEqual({ kind: "refused", issueCodes: ["dry_run.step_failed"] });
  });

  it("de-duplicates a code the check repeats", async () => {
    const attempt = await automationStudioLlmEvidenceCompletionAttempt({ result: {}, steps, checkCompletion: () => refusal("a.issue", "b.issue", "a.issue"), dryRun: async () => undefined });
    expect(attempt).toMatchObject({ kind: "refused", issueCodes: ["a.issue", "b.issue"] });
  });

  it("hands the check copies, so what it changes is neither the result nor the draft", async () => {
    const result = { plan: "original" };
    const draft = steps.map((step) => ({ ...step }));
    await automationStudioLlmEvidenceCompletionAttempt({
      result, steps: draft, dryRun: async () => undefined,
      checkCompletion: (checked, context) => {
        checked.plan = "tampered";
        (context.steps[0] as { actionId: string }).actionId = "tampered";
        return { ok: true };
      }
    });
    expect(result.plan).toBe("original");
    expect(draft[0]!.actionId).toBe("press");
  });

  it("ends invalid_decision on a check answer it cannot read, without replaying", async () => {
    const dryRun = vi.fn(async () => undefined);
    await expect(automationStudioLlmEvidenceCompletionAttempt({ result: {}, steps, checkCompletion: () => ({ ok: "yes" }) as never, dryRun }))
      .resolves.toEqual({ kind: "ended", code: "llm_evidence_loop.invalid_decision" });
    expect(dryRun).not.toHaveBeenCalled();
  });

  it("returns a check that threw as thrown, and as cancelled when the signal was given", async () => {
    const error = new Error("check failed");
    const dryRun = vi.fn(async () => undefined);
    await expect(automationStudioLlmEvidenceCompletionAttempt({ result: {}, steps, checkCompletion: () => { throw error; }, dryRun }))
      .resolves.toEqual({ kind: "threw", error });

    const controller = new AbortController();
    await expect(automationStudioLlmEvidenceCompletionAttempt({ result: {}, steps, signal: controller.signal, dryRun, checkCompletion: () => { controller.abort(); throw error; } }))
      .resolves.toEqual({ kind: "ended", code: "llm_evidence_loop.cancelled" });
    expect(dryRun).not.toHaveBeenCalled();
  });

  it("replays nothing once a check has aborted the signal, even when it answered", async () => {
    const controller = new AbortController();
    const dryRun = vi.fn(async () => undefined);
    await expect(automationStudioLlmEvidenceCompletionAttempt({ result: {}, steps, signal: controller.signal, dryRun, checkCompletion: () => { controller.abort(); return { ok: true }; } }))
      .resolves.toEqual({ kind: "ended", code: "llm_evidence_loop.cancelled" });
    expect(dryRun).not.toHaveBeenCalled();
  });

  it("ends as the dry run ends, when it was cancelled", async () => {
    await expect(automationStudioLlmEvidenceCompletionAttempt({ result: {}, steps, checkCompletion: () => refusal("a.issue"), dryRun: async () => "cancelled" }))
      .resolves.toEqual({ kind: "ended", code: "llm_evidence_loop.cancelled" });
  });

  // Flow Bootstrap puts back the step that reached the start location when the
  // model had withdrawn it, and nothing on the record said so: the Flow judged
  // had a step the model took out. The check says which, and the row keeps it,
  // on an accepted completion and a refused one alike.
  it("carries a restored step from the check onto the completion row, accepted or refused", async () => {
    const restoredStep = { step: 1, withdrawnAs: "dropped" as const };
    const tools = [{ toolId: "press", description: "Press.", inputSchema: { type: "object" }, effect: "mutate" as const }];
    let attempts = 0;
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, maxIterations: 6, maxToolCalls: 6, dryRun: false, unusableDecisions: { stalled: () => new Error("stalled") },
      executeTool: async () => ({ kind: "llm_evidence_tool_execution" as const, evidence: { ok: true }, effectApplied: true }),
      decide: vi.fn()
        .mockResolvedValueOnce({ kind: "tool_call", callId: "c1", toolId: "press", input: { target: "a" } })
        .mockResolvedValue({ kind: "complete", result: { summary: "done" } }),
      checkCompletion: () => (attempts += 1) === 1 ? { ...refusal("check.one"), restoredStep } : { ok: true, restoredStep }
    });
    expect(result.ok).toBe(true);
    expect(result.trace.filter((row) => row.decision !== "tool_call").map((row) => [row.decision, row.restoredStep])).toEqual([
      ["unusable", restoredStep],
      ["complete", restoredStep]
    ]);
  });
});
