// Phase 2 for a Flow a round left unfinished: test it, and judge what it does.
//
// **The user's lifecycle (2026-09-30), and the gap this closes.** A build
// explores live and authors its Flow; once the model says the Flow is ready it
// is tested and judged; then it is repaired, declared finished, or -- only if
// there is absolutely no way -- declared not doable. A build that never said
// its Flow was ready skipped straight to an error code: 30 live runs ended
// that way with no test, no judgement and no repair (audit A3, cause 1). So
// what such a round leaves is tested and judged here exactly as a Flow the
// model called ready would be, and the repair works from the judgement.
//
// **The test is the one the loop runs**, handed in by the caller
// (`../../llm/node-tools/dry-run-gate.ts`): the Flow run from where it starts,
// with no provider call, each mutating step verified rather than repeated
// where it has a lasting effect. A replay from the start belongs to judgement
// and repair, never to exploration (user, 2026-09-30), and this is judgement.
//
// **The judgement is the checklist's.** What is done and what is still to do
// is read by the same rule the completion check applies
// (`../instructed-acts/checklist.ts`), acts and their choices alike, so the
// repair is told exactly what a completion would be refused for.
//
// **A finished round is judged by the judge (t195).** A Flow the model said
// was ready and whose test passed is judged against the instruction from what
// that test actually did (the caller's `judge`, `./phases.ts`). One judged
// wrong is made a judgement here too (`automationStudioFlowBootstrapJudgeFinished`),
// carrying the judge's own account, so it takes the same repair path as a
// round that stopped short. The checklist is still read for it, as
// information: the Flow is judged on what its test does.
import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioFlowDraftReplaySignature, automationStudioFlowDraftStepIsProposed, type AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import { automationStudioInstructedActsNotDone, type AutomationStudioInstructedActChecklistItem } from "../instructed-acts/index.ts";
import type {
  AutomationStudioFlowBootstrapJudgedWrong,
  AutomationStudioFlowBootstrapJudgement,
  AutomationStudioFlowBootstrapTested,
  AutomationStudioFlowBootstrapTestVerdict,
  AutomationStudioFlowBootstrapUnfinishedStop
} from "./contracts.ts";

/** What the caller's test answers: the loop's dry-run gate, over the steps it is given. */
export type AutomationStudioFlowBootstrapUnfinishedTest = (steps: AutomationStudioFlowDraftStep[]) => Promise<"cancelled" | "evidence_limit" | { issueCodes: readonly string[] } | undefined>;

/**
 * The Flow as a round left it, as a repair starts from it: only the steps in
 * the Flow, renumbered, each keeping its own id, the act it does and how to run
 * it again, and nothing of the call that took it or of a test before this one.
 */
export function automationStudioFlowBootstrapRepairSeed(steps: readonly AutomationStudioFlowDraftStep[]): AutomationStudioFlowDraftStep[] {
  return steps.filter(automationStudioFlowDraftStepIsProposed).map((step, index) => {
    const copy = structuredClone(step);
    delete copy.callId;
    delete copy.replayed;
    copy.position = index + 1;
    copy.iteration = 0;
    return copy;
  });
}

/**
 * Tests the Flow the round left and judges it. `cancelled` when the build was
 * stopped while the test ran; otherwise the judgement, and the seed the repair
 * starts from, carrying what the test found on each step it ran.
 */
export async function automationStudioFlowBootstrapJudgeUnfinished(input: {
  round: number;
  stopped: AutomationStudioFlowBootstrapUnfinishedStop | "budget";
  steps: readonly AutomationStudioFlowDraftStep[];
  lastIssueCodes: readonly string[];
  /** Absent for a round a budget stopped: nothing is run for a build that is ending. */
  test?: AutomationStudioFlowBootstrapUnfinishedTest;
  /** Whether these steps carry what a test needs (`automationStudioFlowDraftReplayable`). */
  replayable(steps: readonly AutomationStudioFlowDraftStep[]): boolean;
  checklist(steps: readonly AutomationStudioFlowDraftStep[]): AutomationStudioInstructedActChecklistItem[] | undefined;
}): Promise<{ kind: "cancelled" } | { kind: "judged"; judgement: AutomationStudioFlowBootstrapJudgement; seed: AutomationStudioFlowDraftStep[] }> {
  const seed = automationStudioFlowBootstrapRepairSeed(input.steps);
  let tested: AutomationStudioFlowBootstrapTested = "not_tested";
  let testIssueCodes: string[] = [];
  if (input.test && input.replayable(seed)) {
    const refusal = await input.test(seed);
    if (refusal === "cancelled") return { kind: "cancelled" };
    if (refusal === "evidence_limit") testIssueCodes = ["llm_evidence_loop.evidence_limit"];
    else if (refusal) {
      tested = "replay_failed";
      testIssueCodes = [...new Set(refusal.issueCodes)];
    } else tested = "replayed_clean";
  }
  const { done, todo } = checklistRead(input.checklist(seed));
  return {
    kind: "judged",
    seed,
    judgement: {
      round: input.round,
      stopped: input.stopped,
      tested,
      testIssueCodes,
      failedSteps: seed.filter((step) => step.replayed !== undefined && step.replayed.status !== "replayed").map((step) => step.position),
      stepsInFlow: seed.length,
      done,
      todo,
      lastIssueCodes: [...new Set(input.lastIssueCodes)],
      flowSignature: automationStudioFlowDraftReplaySignature(seed)
    }
  };
}

/**
 * The judgement of a finished round the judge sent back: a `no`, or an unsure
 * verdict where steps carried from an earlier Flow were not run in its test.
 * Nothing is run here: the loop's own test already ran (`replayed_clean`), or
 * ran none of the carried steps (`not_tested`). The seed is the Flow the round
 * finished with, which the repair starts from.
 */
export function automationStudioFlowBootstrapJudgeFinished(input: {
  round: number;
  steps: readonly AutomationStudioFlowDraftStep[];
  verdict: Exclude<AutomationStudioFlowBootstrapTestVerdict, { verdict: "yes" }>;
  checklist(steps: readonly AutomationStudioFlowDraftStep[]): AutomationStudioInstructedActChecklistItem[] | undefined;
}): { judgement: AutomationStudioFlowBootstrapJudgement; seed: AutomationStudioFlowDraftStep[] } {
  const seed = automationStudioFlowBootstrapRepairSeed(input.steps);
  const { done, todo } = checklistRead(input.checklist(seed));
  const judge = judgedWrong(input.verdict);
  return {
    seed,
    judgement: {
      round: input.round,
      stopped: "judged_wrong",
      tested: judge.untestedCarried?.length ? "not_tested" : "replayed_clean",
      testIssueCodes: [],
      failedSteps: [],
      stepsInFlow: seed.length,
      done,
      todo,
      lastIssueCodes: [],
      judge,
      flowSignature: automationStudioFlowDraftReplaySignature(seed)
    }
  };
}

/** The judge's account, as a judgement keeps it: only what it said. */
function judgedWrong(verdict: Exclude<AutomationStudioFlowBootstrapTestVerdict, { verdict: "yes" }>): AutomationStudioFlowBootstrapJudgedWrong {
  if (verdict.verdict !== "no") {
    return { verdict: verdict.verdict, findings: verdict.why ? [verdict.why] : [], ...(verdict.untestedCarried?.length ? { untestedCarried: [...verdict.untestedCarried] } : {}) };
  }
  return {
    verdict: "no",
    ...(verdict.expected ? { expected: verdict.expected } : {}),
    ...(verdict.observed ? { observed: verdict.observed } : {}),
    ...(verdict.advice ? { advice: verdict.advice } : {}),
    findings: [...verdict.findings]
  };
}

/** Acts and choices done, and the ids of those still to do, by the checklist's rule. */
function checklistRead(checklist: readonly AutomationStudioInstructedActChecklistItem[] | undefined): { done: number; todo: string[] } {
  const todo = automationStudioInstructedActsNotDone(checklist);
  const all = (checklist ?? []).reduce((total, item) => total + 1 + (item.choices?.length ?? 0), 0);
  return { done: all - todo.length, todo };
}

/** The judgement as the repair's first decision reads it (`../../llm/evidence-loop/resume.ts`): codes, counts and ids, every one of them. */
export function automationStudioFlowBootstrapJudgementValue(judgement: AutomationStudioFlowBootstrapJudgement): JsonObject {
  return {
    stopped: judgement.stopped,
    test: judgement.tested,
    ...(judgement.failedSteps.length ? { stepsThatDidNotWork: [...judgement.failedSteps] } : {}),
    ...(judgement.testIssueCodes.length ? { testIssueCodes: [...judgement.testIssueCodes] } : {}),
    stepsInFlow: judgement.stepsInFlow,
    actsDone: judgement.done,
    actsTodo: [...judgement.todo],
    ...(judgement.lastIssueCodes.length ? { lastRefusedFor: [...judgement.lastIssueCodes] } : {}),
    ...(judgement.judge ? { judge: judgeValue(judgement.judge) } : {})
  };
}

/** The judge's account as the repair reads it: its words are the model's own, already screened by the judge. */
function judgeValue(judge: AutomationStudioFlowBootstrapJudgedWrong): JsonObject {
  return {
    verdict: judge.verdict,
    ...(judge.expected ? { expected: judge.expected } : {}),
    ...(judge.observed ? { observed: judge.observed } : {}),
    ...(judge.advice ? { advice: judge.advice } : {}),
    findings: [...judge.findings],
    ...(judge.untestedCarried?.length ? { untestedCarried: [...judge.untestedCarried] } : {})
  };
}

/**
 * Whether a repair got any further than the judgement before it: more acts or
 * choices done, more steps in the Flow, or fewer of them failing the test. A
 * repair that got no further is the evidence that no route is left.
 *
 * Where a judge sent a Flow back (either side has `judge`), the checklist is
 * information, not the bar: the repair advanced if it handed back a different
 * Flow -- its replay signature changed -- or more of the checklist is done. A
 * repair that hands back the same Flow is the evidence for not doable.
 */
export function automationStudioFlowBootstrapJudgementAdvanced(before: AutomationStudioFlowBootstrapJudgement, after: AutomationStudioFlowBootstrapJudgement): boolean {
  if (before.judge || after.judge) return after.flowSignature !== before.flowSignature || after.done > before.done;
  if (after.done > before.done || after.stepsInFlow > before.stepsInFlow) return true;
  if (before.tested === "replay_failed" && after.tested === "replayed_clean") return true;
  return before.tested === "replay_failed" && after.tested === "replay_failed" && after.failedSteps.length < before.failedSteps.length;
}
