// The step log's answer steps: what Core did with a decision that ran no tool
// -- an amendment, a call refused as a repeat -- written as a step of its own,
// so Core's answer no longer lives only in the next request.
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { automationStudioLlmEvidenceLoopTraceRecorder, type AutomationStudioLlmEvidenceLoopTrace } from "../../evidence-loop/index.ts";
import { automationStudioLlmStepLogAnswer, automationStudioLlmStepLogScope } from "../index.ts";

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), "fluxiq-answer-step-"));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

const env = () => ({ FLUXIQ_LLM_STEP_LOG_DIR: directory });

function json(file: string): unknown {
  return JSON.parse(readFileSync(file, "utf8"));
}

// Rows as live run `run-murzln6g-11debe1d` recorded them (its build's evidence loop steps, iterations 11, 12, 20 and 29).
const amendedWithRefusal: AutomationStudioLlmEvidenceLoopTrace = { iteration: 11, decision: "amend_draft", resultCode: "llm_evidence_loop.draft_amended", amended: 1, amendmentsRefused: [{ step: 10, reason: "act_already_named", nodeId: "web.output.dom-click" }] };
const refusedAgain: AutomationStudioLlmEvidenceLoopTrace = { iteration: 12, decision: "amend_draft", resultCode: "llm_evidence_loop.draft_unchanged", amended: 0, amendmentsRefused: [{ step: 10, reason: "act_already_named", nodeId: "web.output.dom-click" }] };
const repeatRefused: AutomationStudioLlmEvidenceLoopTrace = { iteration: 20, decision: "tool_call", toolId: "core.run_node", resultCode: "llm_evidence_loop.repeat_refused", resultReason: "failed" };
const rerun: AutomationStudioLlmEvidenceLoopTrace = { iteration: 29, decision: "amend_draft", resultCode: "llm_evidence_loop.draft_rerun", amended: 0 };

describe("an answer step", () => {
  it("writes Core's answer to each amendment and to a call refused as a repeat, in order, and lists it", () => {
    automationStudioLlmStepLogScope.within({ part: "creation" }, () => automationStudioLlmStepLogScope.run({ round: 0, phase: "explore" }, () => {
      for (const row of [amendedWithRefusal, refusedAgain, repeatRefused, rerun]) automationStudioLlmStepLogAnswer(row, env());
    }, env()), env());

    expect(readdirSync(directory).sort()).toEqual(["0001-answer-amend_draft", "0002-answer-amend_draft", "0003-answer-core.run_node", "0004-answer-amend_draft", "index.md"]);
    expect(json(path.join(directory, "0001-answer-amend_draft", "result.json"))).toEqual({
      iteration: 11, decision: "amend_draft", verdict: "partly_applied", resultCode: "llm_evidence_loop.draft_amended",
      applied: 1, refused: [{ step: 10, reason: "act_already_named", nodeId: "web.output.dom-click" }]
    });
    expect(json(path.join(directory, "0002-answer-amend_draft", "result.json"))).toMatchObject({ verdict: "refused", applied: 0, refused: [{ step: 10, reason: "act_already_named" }] });
    expect(json(path.join(directory, "0003-answer-core.run_node", "result.json"))).toEqual({
      iteration: 20, decision: "tool_call", toolId: "core.run_node", verdict: "refused", resultCode: "llm_evidence_loop.repeat_refused", resultReason: "failed", reason: "llm_evidence_loop.repeat_refused"
    });
    expect(json(path.join(directory, "0004-answer-amend_draft", "result.json"))).toMatchObject({ verdict: "applied", resultCode: "llm_evidence_loop.draft_rerun" });
    expect(json(path.join(directory, "0002-answer-amend_draft", "meta.json"))).toMatchObject({
      step: 2, kind: "answer", iteration: 12, decision: "amend_draft", part: "creation", round: 0, phase: "explore",
      verdict: "refused", resultCode: "llm_evidence_loop.draft_unchanged", summary: "amend_draft refused: act_already_named"
    });
    expect(json(path.join(directory, "0003-answer-core.run_node", "meta.json"))).not.toHaveProperty("provider");
    const index = readFileSync(path.join(directory, "index.md"), "utf8");
    expect(index).toContain("| 0001 | answer | - | amend_draft partly_applied: act_already_named | - |");
    expect(index).toContain("| 0003 | answer | core.run_node | refused llm_evidence_loop.repeat_refused (the same call before: failed) | - |");
  });

  it("says an edit that changed nothing and was refused nothing was ignored, and why", () => {
    automationStudioLlmStepLogAnswer({ iteration: 3, decision: "amend_draft", resultCode: "llm_evidence_loop.draft_amendment_undone", amended: 1 }, env());
    automationStudioLlmStepLogAnswer({ iteration: 4, decision: "amend_draft", resultCode: "llm_evidence_loop.draft_unchanged", amended: 0 }, env());
    expect(json(path.join(directory, "0001-answer-amend_draft", "result.json"))).toMatchObject({ verdict: "ignored", reason: "llm_evidence_loop.draft_amendment_undone", applied: 1 });
    expect(json(path.join(directory, "0002-answer-amend_draft", "result.json"))).toMatchObject({ verdict: "ignored", reason: "llm_evidence_loop.draft_unchanged", refused: [] });
  });

  // t174-w108 R3 (`run-musp8nz1-dbd3905a`, step 0028): the answer folder kept
  // each refusal's step and code, while the model was told `next`, the
  // positions, each reason's sentence and the progress counts; what it read
  // could be seen only in the next request.
  it("keeps the whole amendment answer the next request carries, word for word", () => {
    const amendmentCheck = {
      ok: false, code: "llm_evidence_loop.draft_amendments_refused",
      refused: [{ step: 13, reason: "act_already_named", next: "The acts checklist shows a1.quantity done, so nothing is left to do for it: do not name it again." }, { step: 14, reason: "no_such_step" }],
      applied: 0, steps: 13, positions: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
      reasons: { act_already_named: "That step already names that act.", no_such_step: "There is no step at that number." },
      stepsWithoutProgress: 1, maxStepsWithoutProgress: 8, instruction: "The listed amendments changed nothing."
    };
    automationStudioLlmStepLogAnswer({ ...refusedAgain, amendmentsRefused: [{ step: 13, reason: "act_already_named" }, { step: 14, reason: "no_such_step" }], amendmentCheck }, env());
    expect(json(path.join(directory, "0001-answer-amend_draft", "result.json"))).toMatchObject({ verdict: "refused", told: amendmentCheck });
    // A row with no answer to the model says so by leaving it out.
    automationStudioLlmStepLogAnswer(refusedAgain, env());
    expect(json(path.join(directory, "0002-answer-amend_draft", "result.json"))).not.toHaveProperty("told");
  });

  it("writes nothing for a row whose tool ran, which has its tool step, nor with the step log off", () => {
    automationStudioLlmStepLogAnswer({ iteration: 2, decision: "tool_call", toolId: "core.run_node", resultCode: "web.action.succeeded" }, env());
    automationStudioLlmStepLogAnswer({ iteration: 3, decision: "complete" }, env());
    automationStudioLlmStepLogAnswer(refusedAgain, {});
    expect(readdirSync(directory)).toEqual([]);
  });

  it("is written by the loop's own recorder as each such row enters the record, with the row's progress", () => {
    const trace: AutomationStudioLlmEvidenceLoopTrace[] = [];
    const recorder = automationStudioLlmEvidenceLoopTraceRecorder(trace, env());
    recorder.record({ iteration: 1, decision: "tool_call", toolId: "core.run_node", callId: "c1", resultCode: "web.action.succeeded" }, { draftChanged: true });
    recorder.record(refusedAgain, { draftChange: { targetedStepIds: ["d10"], appliedCount: 0, refusedCount: 1, keptStepCount: 8 } });
    expect(trace).toHaveLength(2);
    expect(readdirSync(directory).sort()).toEqual(["0001-answer-amend_draft", "index.md"]);
    expect(json(path.join(directory, "0001-answer-amend_draft", "result.json"))).toMatchObject({
      verdict: "refused",
      draftChange: { targetedStepIds: ["d10"], appliedCount: 0, refusedCount: 1, keptStepCount: 8 },
      progress: { draftRevisionBefore: 1, draftRevisionAfter: 1, draftState: "unchanged" }
    });
    expect(existsSync(path.join(directory, "0001-answer-amend_draft", "meta.json"))).toBe(true);
  });

  // t174-w116 (debug `run-musq0b1m-0472cfa0` R5, step 0061): one answer read `applied: 0` beside
  // `draftChange.appliedCount: 1`, because a rerun the decision asked for counted in one and not the other.
  it("counts a rerun among what was applied, as the row's draft change does", () => {
    automationStudioLlmStepLogAnswer({ ...rerun, amendmentsRefused: [{ step: 9, reason: "run_by_the_loop" }], draftChange: { targetedStepIds: ["d9"], appliedCount: 1, refusedCount: 1, keptStepCount: 9 } }, env());
    expect(json(path.join(directory, "0001-answer-amend_draft", "result.json"))).toMatchObject({ verdict: "partly_applied", applied: 1, draftChange: { appliedCount: 1 } });
  });

  // t174-w116 R3: the answer is written as the row is recorded, and what Core then tells the model
  // is known only after its guard has counted the row; it is added to that same answer step.
  it("adds what the model was told to the answer step already written for that row, not as a new step", () => {
    const row: AutomationStudioLlmEvidenceLoopTrace = { ...refusedAgain };
    automationStudioLlmStepLogAnswer(row, env());
    const told = { ok: false, code: "llm_evidence_loop.draft_amendments_refused", refused: [{ step: 10, reason: "act_already_named" }], applied: 0 };
    automationStudioLlmStepLogAnswer(row, env(), told);
    expect(readdirSync(directory).sort()).toEqual(["0001-answer-amend_draft", "index.md"]);
    expect(json(path.join(directory, "0001-answer-amend_draft", "result.json"))).toMatchObject({ verdict: "refused", told });
    expect(readFileSync(path.join(directory, "index.md"), "utf8").match(/\| answer \|/gu)).toHaveLength(1);
  });
});
