// What a part's run came to, read off the trace it left and off the gate, in the words
// a person or a model is told. A trace's messages can quote a page and are never read:
// `reason` is one of the fixed sentences below, and a step is named as a part's steps
// are named everywhere (`../step-words.ts`).
import { AUTOMATION_STUDIO_ATTEMPT_ACT_CLASSES, type AutomationStudioAttemptActClass } from "@fluxiq/contracts/automation";
import type { ProjectPartRunStop, RunProjectPartResponse } from "../../../../../api-contracts/automation.ts";
import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../../../../../flows/executable/graph/index.ts";
import { automationStudioPartSteps } from "../../../../../runtime/project-parts/index.ts";
import type { AutomationStudioGraphExecutionTrace, AutomationStudioNodeAttemptTrace } from "../../../executor/index.ts";
import type { AutomationStudioCandidateTrialLandedAct } from "../../candidate-trial/index.ts";
import { projectPartStepOf } from "../step-words.ts";
import type { ProjectPartGateStop, ProjectPartGateStopReason } from "./step-gate.ts";

const GATE_WORDS: Readonly<Record<ProjectPartGateStopReason, string>> = {
  no_target: "This step's control could not be checked on the page, so it was not done.",
  target_gone: "The page changed: this step's control is no longer on it, so it was not done.",
  not_read: "This step's control could not be told apart on the page just before it, so it was not done.",
  other_page: "The page changed: it is not the one this step runs on, so it was not done.",
  not_allowed: "This step would do something that was not asked for, so it was not done.",
  unknown_step: "This step is not one the part saved, so it was not done."
};

const UNCERTAIN = "This step may or may not have happened, so it was not tried again.";
const FAILED = "This step could not be done.";
const CANCELLED = "The run was stopped here.";
const NEEDS_PERSON = "This step is waiting on a person, so the part stopped here.";

export function projectPartRunOutcome(input: {
  trace: AutomationStudioGraphExecutionTrace | undefined;
  executed: AutomationStudioGraphExecutionTrace | undefined;
  gate: ProjectPartGateStop | undefined;
  aborted: boolean;
  outputIds: readonly string[];
  landed: readonly AutomationStudioCandidateTrialLandedAct[];
  nodeOf(nodeId: string): AutomationStudioFlowNode | undefined;
}): Pick<RunProjectPartResponse, "status" | "outputs" | "stoppedAt" | "acts"> {
  const { trace, gate } = input;
  const failing = trace ? deepestUnfinished(trace.attempts) : undefined;
  const stoppedAt = (reason: string, node: AutomationStudioFlowNode | undefined): ProjectPartRunStop => ({ stepLabel: labelOf(node), reason });
  const nodeOfFailing = failing ? input.nodeOf(failing.nodeId) : undefined;
  const base = { outputs: outputsOf(input.executed, input.outputIds), acts: classesOf(input.landed) };
  if (gate) return { ...base, status: "stopped", stoppedAt: stoppedAt(GATE_WORDS[gate.reason], gate.node) };
  if (input.aborted || trace?.status === "cancelled") return { ...base, status: "cancelled", stoppedAt: stoppedAt(CANCELLED, nodeOfFailing) };
  if (hasUncertain(trace)) return { ...base, status: "stopped", stoppedAt: stoppedAt(UNCERTAIN, nodeOfFailing) };
  if (trace?.status === "waiting") return { ...base, status: "stopped", stoppedAt: stoppedAt(NEEDS_PERSON, nodeOfFailing) };
  if (trace?.status === "succeeded" && !trace.stopReason) return { ...base, status: "succeeded" };
  return { ...base, status: "failed", stoppedAt: stoppedAt(FAILED, nodeOfFailing) };
}

/** A run stopped as Outcome uncertain says so at its root, or in the frame it called. */
function hasUncertain(trace: AutomationStudioGraphExecutionTrace | undefined): boolean {
  return trace?.failure?.code === "run.outcome_uncertain" || (trace?.attempts ?? []).some((attempt) => hasUncertain(attempt.childTrace));
}

function outputsOf(executed: AutomationStudioGraphExecutionTrace | undefined, outputIds: readonly string[]): Record<string, JsonValue> {
  if (!executed) return {};
  return Object.fromEntries(outputIds.flatMap((id) => executed.values[id] === undefined ? [] : [[id, executed.values[id]]]));
}

function classesOf(landed: readonly AutomationStudioCandidateTrialLandedAct[]): AutomationStudioAttemptActClass[] {
  const found = new Set<string>(landed.flatMap((act) => act.consequences));
  return AUTOMATION_STUDIO_ATTEMPT_ACT_CLASSES.filter((each) => found.has(each));
}

/** The attempt a run ended on: its last, followed into the frame it called. */
function deepestUnfinished(attempts: readonly AutomationStudioNodeAttemptTrace[]): AutomationStudioNodeAttemptTrace | undefined {
  const last = attempts.at(-1);
  if (!last) return undefined;
  return last.childTrace?.attempts.length ? deepestUnfinished(last.childTrace.attempts) ?? last : last;
}

function labelOf(node: AutomationStudioFlowNode | undefined): string {
  const step = node ? automationStudioPartSteps({ nodes: [node], edges: [] })[0] : undefined;
  return step ? projectPartStepOf(step, undefined).label : "A step";
}
