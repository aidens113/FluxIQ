// A repair's `complete` on the Flow the judge said does not do what was asked,
// unchanged, is refused as an identical retry of a failed act (live run
// murwcmx2, cause C-C); and a model that keeps completing it ends its round on
// the stall guard and the build as not doable, never on a lone later yes.
import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { runAutomationStudioLlmEvidenceLoop, AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_FEEDBACK_TOOL_ID, automationStudioFlowBootstrapDraftStepIsWritable, type AutomationStudioLlmEvidenceLoopAccounting, type AutomationStudioLlmEvidenceLoopResult } from "../../../llm/index.ts";
import type { AutomationStudioLlmEvidenceLoopResume } from "../../../llm/evidence-loop/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_MAX_REFUSED_REPEATS_IN_A_ROW } from "../../../llm/repeat-guard/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_DEFAULT_MAX_STEPS_WITHOUT_PROGRESS } from "../../../loop-limits/index.ts";
import { automationStudioInstructedActsChecklist } from "../../instructed-acts/index.ts";
import {
  AUTOMATION_STUDIO_FLOW_BOOTSTRAP_UNCHANGED_SINCE_JUDGED_WRONG,
  automationStudioFlowBootstrapRepairSeed,
  automationStudioFlowBootstrapUnchangedCompleteRefusal,
  runAutomationStudioFlowBootstrapBuildPhases,
  type AutomationStudioFlowBootstrapRoundRequest,
  type AutomationStudioFlowBootstrapTestVerdict
} from "../index.ts";

const INSTRUCTION = "Search for wireless earbuds and save every result to the sheet.";
const ADVICE = "exclude only items that are themselves accessories";
/** The completion check's own rule: a draft of library steps is the Flow it builds. */
const writable = automationStudioFlowBootstrapDraftStepIsWritable;

function step(position: number, overrides: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep {
  return {
    position, id: `d${position}`, iteration: position, callId: `c${position}`, toolId: "core.run_node", actionId: "web.dom.click", input: {}, effect: "mutate", effectApplied: true, disposition: "kept",
    ranWith: { target: `t${position}` }, replay: { from: { at: "start" } }, ...overrides
  };
}

/** The Flow round 0 finished with, as the loop's test left it: every step replayed. */
function judgedFlow(): AutomationStudioFlowDraftStep[] {
  return [1, 2, 3].map((position) => step(position, { replayed: { step: position, actionId: "web.dom.click", status: "replayed" } }));
}

function judgement(verdict: "no" | "unknown" | "not_judged", advice?: string): JsonObject {
  const judge: JsonObject = verdict === "no" ? { verdict, ...(advice ? { advice } : {}), findings: ["earbuds sold with a case were dropped"] } : { verdict, findings: ["the judge could not settle it"] };
  return { stopped: "judged_wrong", test: "replayed_clean", stepsInFlow: 3, actsDone: 1, actsTodo: [], judge };
}

function repairOf(verdict: "no" | "unknown" | "not_judged", advice?: string): { seed: AutomationStudioFlowDraftStep[]; resume: AutomationStudioLlmEvidenceLoopResume } {
  return { seed: automationStudioFlowBootstrapRepairSeed(judgedFlow()), resume: { revision: 1, stopped: "judged_wrong", outstandingIssueCodes: [], judgement: judgement(verdict, advice) } };
}

describe("a repair's completion of the Flow its judge said does not do what was asked", () => {
  it("is refused when the Flow is unchanged since that `no`, telling the model to change what the advice names and that an unchanged round ends the build as not doable", () => {
    const repair = repairOf("no", ADVICE);
    // The draft as the round holds it: the seed's steps, re-decided in this round's calls, at other positions, replayed again.
    const steps = repair.seed.map((each, index) => ({ ...each, callId: `r1.${index}`, iteration: 7 + index, position: 4 + index, replayed: { step: 4 + index, actionId: each.actionId, status: "replayed" as const } }));

    const refusal = automationStudioFlowBootstrapUnchangedCompleteRefusal({ writable, repair, steps });

    expect(refusal).toEqual({
      ok: false,
      issueCodes: [AUTOMATION_STUDIO_FLOW_BOOTSTRAP_UNCHANGED_SINCE_JUDGED_WRONG],
      feedback: { ok: false, code: "bootstrap.flow_unchanged_since_judged_wrong", verdict: "no", advice: ADVICE, instruction: expect.any(String) }
    });
    const instruction = refusal!.feedback.instruction as string;
    expect(instruction).toContain("This is the Flow the judge said does not do what was asked (judgement.judge), unchanged: testing it again tests the same thing");
    expect(instruction).toContain("Change what judgement.judge.advice names");
    expect(instruction).toContain("a round that changes nothing ends the build unfinished");
    // The loop has no verb for "not doable": the model is never told to say it.
    expect(instruction).not.toContain("say that it is not doable");
  });

  it("carries no advice the judge did not give", () => {
    const repair = repairOf("no");
    expect(automationStudioFlowBootstrapUnchangedCompleteRefusal({ writable, repair, steps: repair.seed })?.feedback).not.toHaveProperty("advice");
  });

  it("is not refused once the Flow changed: a step's argument, routing or a step added", () => {
    const repair = repairOf("no", ADVICE);
    const [first, second, third] = repair.seed;
    expect(automationStudioFlowBootstrapUnchangedCompleteRefusal({ writable, repair, steps: [first!, second!, { ...third!, ranWith: { target: "t3", where: "name not contains replacement" } }] })).toBeUndefined();
    expect(automationStudioFlowBootstrapUnchangedCompleteRefusal({ writable, repair, steps: [first!, second!, { ...third!, routing: { kind: "optional" } }] })).toBeUndefined();
    expect(automationStudioFlowBootstrapUnchangedCompleteRefusal({ writable, repair, steps: [...repair.seed, step(4)] })).toBeUndefined();
  });

  // The deepseek-bootstrap convergence case: a draft of a domain's own tool
  // steps is not what the check builds, so a corrected plan in the reply over
  // that unchanged draft is a changed Flow.
  it("is not refused when the Flow is built from the reply's plan rather than the draft", () => {
    const repair = repairOf("no", ADVICE);
    const steps = repair.seed.map((each) => ({ ...each, toolId: "demo.look" }));
    expect(automationStudioFlowBootstrapUnchangedCompleteRefusal({ writable, repair: { ...repair, seed: steps }, steps })).toBeUndefined();
  });

  it("is not refused after an `unknown` or `not_judged` verdict, which refuted nothing", () => {
    for (const verdict of ["unknown", "not_judged"] as const) {
      const repair = repairOf(verdict);
      expect(automationStudioFlowBootstrapUnchangedCompleteRefusal({ writable, repair, steps: repair.seed })).toBeUndefined();
    }
  });

  it("is not refused outside a repair after a judge: the exploration, a repair of a round that stopped short, or one with nothing in its Flow", () => {
    expect(automationStudioFlowBootstrapUnchangedCompleteRefusal({ writable, steps: judgedFlow() })).toBeUndefined();
    const stoppedShort = { seed: automationStudioFlowBootstrapRepairSeed(judgedFlow()), resume: { revision: 1, stopped: "iterations" as const, outstandingIssueCodes: [], judgement: { stopped: "iterations", test: "replayed_clean", stepsInFlow: 3, actsDone: 1, actsTodo: [] } } };
    expect(automationStudioFlowBootstrapUnchangedCompleteRefusal({ writable, repair: stoppedShort, steps: stoppedShort.seed })).toBeUndefined();
    const empty = { ...repairOf("no", ADVICE), seed: [] };
    expect(automationStudioFlowBootstrapUnchangedCompleteRefusal({ writable, repair: empty, steps: [] })).toBeUndefined();
  });
});

describe("a model that keeps completing the refuted Flow unchanged", () => {
  it("is shown the refusal each time, and its round ends on the stall guard as a round whose decisions kept coming back unusable", async () => {
    const repair = repairOf("no", ADVICE);
    const decide = vi.fn(async () => ({ kind: "complete", result: { summary: "No change needed." } }));
    const stalled = vi.fn((progress: { issueCodes: readonly string[] }) => Object.assign(new Error("stalled"), { progress }));
    const checkCompletion = vi.fn(async (_result: JsonObject, context: { steps: readonly AutomationStudioFlowDraftStep[] }) => automationStudioFlowBootstrapUnchangedCompleteRefusal({ writable, repair, steps: context.steps }) ?? { ok: true as const });

    await expect(runAutomationStudioLlmEvidenceLoop({
      tools: [{ toolId: "inspect", description: "Read the page.", inputSchema: { type: "object" }, effect: "observe", initialObservation: { input: {} } }],
      decide, executeTool: async () => ({ seen: true }), propagateDecisionErrors: true, maxIterations: 64, checkCompletion,
      unusableDecisions: { maxConsecutive: AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_DEFAULT_MAX_STEPS_WITHOUT_PROGRESS, stalled },
      draft: { seed: repair.seed, resume: repair.resume }
    })).rejects.toThrow("stalled");

    // Every completion was refused, none accepted, and the round stalled on that refusal's code.
    expect(checkCompletion).toHaveBeenCalledTimes(decide.mock.calls.length);
    expect(stalled.mock.calls[0]![0]).toMatchObject({ issueCodes: [AUTOMATION_STUDIO_FLOW_BOOTSTRAP_UNCHANGED_SINCE_JUDGED_WRONG] });
    // Stopped by the repeat guard (t195-w46, run `run-musr9pv3-f4bf6256`): the
    // first refusal is new, and each completion refused again over the same
    // draft counts toward its in-a-row bound, well before the no-progress bound
    // or the 64 decisions.
    expect(decide.mock.calls.length).toBe(1 + AUTOMATION_STUDIO_LLM_EVIDENCE_MAX_REFUSED_REPEATS_IN_A_ROW);
    expect(decide.mock.calls.length).toBeLessThan(AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_DEFAULT_MAX_STEPS_WITHOUT_PROGRESS);
    // The second decision read the refusal's feedback.
    const shown = (decide.mock.calls[1] as unknown as [{ evidence: { toolId: string; value: JsonObject }[] }])[0].evidence;
    expect(shown.find((entry) => entry.toolId === AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_FEEDBACK_TOOL_ID)?.value).toMatchObject({ code: AUTOMATION_STUDIO_FLOW_BOOTSTRAP_UNCHANGED_SINCE_JUDGED_WRONG, advice: ADVICE });
  });

  // Merged with t195-w37 (2026-10-03): a stall ends the build "not finished"; "not doable" only on the judge's
  // "can no longer be had". The stalled round brought no judge's fix of its own, so no extra round opens.
  it("ends the build not finished for no progress after that stalled repair, and the judge is never asked again", async () => {
    const accounting = (iterations: number): AutomationStudioLlmEvidenceLoopAccounting => ({ iterations, toolCalls: iterations, evidenceBytes: 100, inputTokens: 1_000 * iterations, cacheHitInputTokens: 0, outputTokens: 100 * iterations, totalTokens: 1_100 * iterations, estimatedCostUsd: 0.001 * iterations });
    const spent = { inputTokens: 1_000, outputTokens: 100, totalTokens: 1_100, estimatedCostUsd: 0.001 };
    const no: AutomationStudioFlowBootstrapTestVerdict = { verdict: "no", advice: ADVICE, findings: ["earbuds sold with a case were dropped"], spent };
    const requests: AutomationStudioFlowBootstrapRoundRequest[] = [];
    const judge = vi.fn(async () => no);
    const rounds: Array<(request: AutomationStudioFlowBootstrapRoundRequest) => AutomationStudioLlmEvidenceLoopResult> = [
      () => ({ ok: true, result: { summary: "Saves the earbuds." }, trace: [], steps: judgedFlow(), accounting: accounting(10) }),
      // Round 1 as the loop leaves it after the refusals above: stalled, handing back the seed it started from.
      (request) => { throw request.stalled({ issueCodes: [AUTOMATION_STUDIO_FLOW_BOOTSTRAP_UNCHANGED_SINCE_JUDGED_WRONG], trace: [], accounting: accounting(8), steps: request.repair!.seed }); }
    ];

    const outcome = await runAutomationStudioFlowBootstrapBuildPhases({
      round: async (request) => { requests.push(request); return rounds[requests.length - 1]!(request); },
      judge,
      test: async (steps) => { for (const each of steps) each.replayed = { step: each.position, actionId: each.actionId, status: "replayed" }; return undefined; },
      replayable: (steps) => steps.length > 0,
      checklist: (steps) => automationStudioInstructedActsChecklist({ instructionText: INSTRUCTION, draftSteps: steps }),
      budget: { maxCostUsd: 0.25, maxDurationMs: 540_000 },
      maxIterations: 64,
      keep: async () => undefined,
      now: () => 0
    });

    expect(requests).toHaveLength(2);
    expect(requests[1]!.repair!.resume.judgement).toMatchObject({ judge: { verdict: "no", advice: ADVICE } });
    expect(judge).toHaveBeenCalledTimes(1);
    expect(outcome.kind).toBe("unfinished");
    if (outcome.kind !== "unfinished") return;
    expect(outcome.ending).toMatchObject({ kind: "not_finished", tried: { rounds: 2 } });
    expect(outcome.rounds).toBe(2);
  });
});
