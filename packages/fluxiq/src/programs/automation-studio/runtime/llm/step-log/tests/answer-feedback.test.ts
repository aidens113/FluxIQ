// Every decision Core answers without running a tool gets its answer folder,
// with Core's code and the entries Core showed the model about it. Live run
// `run-musp39u8-9ac026ab` left 0179-0183 and 0265-0267 (decision_shape_invalid)
// and 0279, 0290, 0291 (a completion refused full_run_required) with a decide
// folder and no answer, so what Core said to each lived only inside the next
// request.
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runAutomationStudioLlmEvidenceLoop } from "../../index.ts";
import { automationStudioLlmStepLogAnswer } from "../index.ts";

let directory: string;
let saved: string | undefined;

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), "fluxiq-answer-feedback-"));
  saved = process.env.FLUXIQ_LLM_STEP_LOG_DIR;
  process.env.FLUXIQ_LLM_STEP_LOG_DIR = directory;
});

afterEach(() => {
  if (saved === undefined) delete process.env.FLUXIQ_LLM_STEP_LOG_DIR;
  else process.env.FLUXIQ_LLM_STEP_LOG_DIR = saved;
  rmSync(directory, { recursive: true, force: true });
});

const answers = (): string[] => readdirSync(directory).filter((name) => name.includes("-answer-"));
const json = (...parts: string[]): Record<string, unknown> => JSON.parse(readFileSync(path.join(directory, ...parts), "utf8")) as Record<string, unknown>;
const tools = [{ toolId: "inspect", description: "Collect bounded evidence.", inputSchema: { type: "object" } }];
const complete = { kind: "complete", result: { done: true } };
const look = (callId: string) => ({ kind: "tool_call", callId, toolId: "inspect", input: { area: callId } });
type Shown = { evidence: ReadonlyArray<{ callId: string; toolId: string; value: unknown }> };
type Feedback = Array<{ callId: string; toolId: string; value: Record<string, unknown> }>;

describe("an answer folder for a decision Core refused", () => {
  it("is written for a shape-invalid decision, with the code and the note the model was shown next", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(look("call.1"))
      // A tool call carrying a key the grammar does not list.
      .mockResolvedValueOnce({ ...look("call.2"), reason: "the next page" })
      .mockResolvedValueOnce(complete);
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, decide, executeTool: async () => ({ seen: true }), propagateDecisionErrors: true, maxIterations: 10, dryRun: false,
      unusableDecisions: { maxConsecutive: 3, stalled: () => new Error("stalled") }
    });

    expect(result).toMatchObject({ ok: true });
    expect(answers()).toEqual(["0002-answer-unusable"]);
    const answer = json("0002-answer-unusable", "result.json");
    expect(answer).toMatchObject({ iteration: 2, decision: "unusable", verdict: "refused", resultCode: "llm_evidence_loop.decision_shape_invalid", reason: "llm_evidence_loop.decision_shape_invalid" });
    const feedback = answer.feedback as Feedback;
    expect(feedback.map((entry) => entry.toolId)).toContain("core.decision_check");
    expect(feedback.find((entry) => entry.toolId === "core.decision_check")!.value).toMatchObject({ issueCodes: ["llm_evidence_loop.decision_shape_invalid"] });
    // Exactly what the next decision was shown of Core's answer.
    const next = (decide.mock.calls as Array<[Shown]>)[2]![0].evidence;
    for (const entry of feedback) expect(next.find((shown) => shown.callId === entry.callId)?.value).toEqual(entry.value);
    expect(json("0002-answer-unusable", "meta.json")).toMatchObject({
      step: 2, kind: "answer", iteration: 2, decision: "unusable", verdict: "refused",
      resultCode: "llm_evidence_loop.decision_shape_invalid", summary: "refused llm_evidence_loop.decision_shape_invalid"
    });
    expect(readFileSync(path.join(directory, "index.md"), "utf8")).toContain("| 0002 | answer | - | refused llm_evidence_loop.decision_shape_invalid | - |");
  });

  it("is written for a completion refused full_run_required, naming the code and the steps it listed", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(look("call.1"))
      .mockResolvedValueOnce(complete)
      .mockResolvedValueOnce(complete);
    const refusal = { code: "llm_evidence_loop.full_run_required", steps: [{ step: 2, replayed: "not_run_in_this_build" }, { step: 3, replayed: "not_run_in_this_build" }], instruction: "Rerun each, then finish again." };
    const checkCompletion = vi.fn()
      .mockReturnValueOnce({ ok: false, issueCodes: ["llm_evidence_loop.full_run_required"], feedback: refusal })
      .mockReturnValueOnce({ ok: true });
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, decide, checkCompletion, executeTool: async () => ({ seen: true }), propagateDecisionErrors: true, maxIterations: 10, dryRun: false,
      unusableDecisions: { maxConsecutive: 3, stalled: () => new Error("stalled") }
    });

    expect(result).toMatchObject({ ok: true });
    expect(answers()).toEqual(["0002-answer-unusable"]);
    const answer = json("0002-answer-unusable", "result.json");
    expect(answer).toMatchObject({ iteration: 2, decision: "unusable", verdict: "refused", resultCode: "llm_evidence_loop.full_run_required", steps: [2, 3] });
    const feedback = answer.feedback as Feedback;
    expect(feedback.find((entry) => entry.toolId === "core.completion_check")!.value).toEqual(refusal);
    const next = (decide.mock.calls as Array<[Shown]>)[2]![0].evidence;
    for (const entry of feedback) expect(next.find((shown) => shown.callId === entry.callId)?.value).toEqual(entry.value);
    expect(json("0002-answer-unusable", "meta.json")).toMatchObject({
      kind: "answer", verdict: "refused", resultCode: "llm_evidence_loop.full_run_required", summary: "refused llm_evidence_loop.full_run_required: steps 2, 3"
    });
  });

  it("is written for a call answered from memory, and not for a decision call the provider never answered", () => {
    const env = { FLUXIQ_LLM_STEP_LOG_DIR: directory };
    automationStudioLlmStepLogAnswer({ iteration: 4, decision: "tool_call", toolId: "core.run_node", resultCode: "llm_evidence_loop.already_answered" }, env, undefined,
      () => [{ callId: "core.request_check.4", toolId: "core.request_check", value: { code: "llm_evidence_loop.already_answered", answeredByCallId: "c2" } }]);
    automationStudioLlmStepLogAnswer({ iteration: 5, decision: "unusable", resultCode: "llm.provider_timeout" }, env);
    expect(answers()).toEqual(["0001-answer-core.run_node"]);
    expect(json("0001-answer-core.run_node", "result.json")).toEqual({
      iteration: 4, decision: "tool_call", toolId: "core.run_node", verdict: "refused", resultCode: "llm_evidence_loop.already_answered", reason: "llm_evidence_loop.already_answered",
      feedback: [{ callId: "core.request_check.4", toolId: "core.request_check", value: { code: "llm_evidence_loop.already_answered", answeredByCallId: "c2" } }]
    });
  });
});
