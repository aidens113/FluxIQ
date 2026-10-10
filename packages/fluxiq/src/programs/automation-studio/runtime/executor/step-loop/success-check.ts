import { AUTOMATION_STUDIO_SUBFLOW_CONTRACT_KEYS } from "../../../nodes/control-flow/index.ts";
import type { AutomationStudioGraphExecutionTrace } from "../contracts.ts";
import { automationStudioFactConditionsHold, automationStudioSubflowContract } from "../lifecycle/index.ts";
import { automationStudioConditionEvidence, observeAutomationStudioFacts } from "../lifecycle-run/index.ts";
import type { AutomationStudioStepLoopContext } from "./loop-context.ts";

/** A condition no host can answer, standing in for a success check that could not be read: it always answers `unknown`. */
const UNREADABLE_CHECK = { fact: "core:unreadable_success_check", op: "exists", target: { handle: "core:unreadable" } } as const;

/**
 * The trace of a frame that reached its End (state-aware recovery plan, C2),
 * after its success check: graph metadata `fluxiq.successCheck`, asked in one
 * observation with the frame's inputs and values.
 *
 * - No check declared: no call, and the trace is exactly the succeeded trace
 *   it always was. The End node's `expectedState` is not a default check.
 * - `true`: the frame succeeded, and the trace keeps what the check answered.
 * - `false`: the frame fails with a verification failure
 *   (`executor.success_check.false`), which is not retryable: a Call Subflow
 *   attempt carries it, so its node's On Fail paths apply in the parent.
 * - `unknown`: the frame fails as unproven (`executor.success_check.unknown`).
 *   A check that could not be read is `unknown`, never skipped.
 *
 * A handler body is not a frame reaching its End: it ends at its Handler End
 * in its handler's graph, whose check is that graph's frame's, so it is never
 * checked here.
 */
export async function automationStudioStepFrameSucceeded(ctx: AutomationStudioStepLoopContext, nodeId: string): Promise<AutomationStudioGraphExecutionTrace> {
  const succeeded: AutomationStudioGraphExecutionTrace = { status: "succeeded", startedAt: ctx.startedAt, finishedAt: ctx.now(), currentNodeId: nodeId, attempts: ctx.attempts, values: ctx.values, effects: ctx.effects, regionTransitions: ctx.regionTransitions };
  const invocation = ctx.options.invocation;
  if (invocation?.frame.cursor.phase === "handler" || ctx.flow.metadata?.[AUTOMATION_STUDIO_SUBFLOW_CONTRACT_KEYS.successCheck] === undefined) return succeeded;
  const contract = automationStudioSubflowContract(ctx.flow);
  const unreadable = contract.problems.some((problem) => problem.startsWith(`metadata.${AUTOMATION_STUDIO_SUBFLOW_CONTRACT_KEYS.successCheck}`));
  const conditions = unreadable ? [...contract.successCheck, UNREADABLE_CHECK] : contract.successCheck;
  if (!conditions.length) return succeeded;
  const observation = await observeAutomationStudioFacts({
    hostRuntime: ctx.options.hostRuntime,
    groups: [{ key: "success", conditions }],
    context: { inputs: invocation?.frame.inputs ?? ctx.options.inputs ?? {}, values: ctx.values, nodeId, ...(ctx.options.signal ? { signal: ctx.options.signal } : {}) },
    now: ctx.now
  });
  if (observation.problem && invocation && !invocation.run.lifecycle.problems.includes(observation.problem)) invocation.run.lifecycle.problems.push(observation.problem);
  const answers = observation.results.get("success") ?? [];
  const truth = automationStudioFactConditionsHold(conditions, answers);
  const successCheck = { truth, evidence: answers.map(automationStudioConditionEvidence) };
  if (truth === "true") return { ...succeeded, successCheck };
  const proven = truth === "false";
  return {
    ...succeeded,
    status: "failed",
    successCheck,
    message: proven ? "The run reached its end, but its success check does not hold." : "The run reached its end, but its success check could not be proven.",
    failure: { category: "expected_state_missing", code: proven ? "executor.success_check.false" : "executor.success_check.unknown", retryable: false, stage: "verification" }
  };
}
