import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../../../model/index.ts";
import { AUTOMATION_STUDIO_SUBFLOW_CONTRACT_KEYS } from "../../../nodes/control-flow/index.ts";
import { emitAutomationStudioActivityStepRecovery } from "../../activity/index.ts";
import { automationStudioSubflowContract, selectAutomationStudioEntry } from "../lifecycle/index.ts";
import { automationStudioConditionEvidence, observeAutomationStudioFacts } from "../lifecycle-run/index.ts";
import type { AutomationStudioStepLoopContext } from "./loop-context.ts";

/**
 * Where a new frame begins (state-aware recovery plan, C2): its default entry,
 * the graph's Start node, or the first alternative entry (node metadata
 * `fluxiq.entry`), by ascending `order`, whose `when` conditions are all
 * `true` and whose `requires` names are all bound in the frame's inputs.
 *
 * The caller asks once per new frame, after On Start, and never on a seed, a
 * resume, a run told where to start or a handler body. Every entry's `when` is
 * asked in one batched observation; a graph that declares no entry asks
 * nothing and records nothing. An entry whose declaration could not be read is
 * never taken, so a condition the parser dropped cannot loosen it.
 *
 * The chosen node still passes its readiness gate and On Before: it is simply
 * where the step loop starts. Where the frame began is set on the frame and
 * kept for its first attempt (`ctx.lifecycle.entry`); a non-default entry says
 * so in the chat with an `entry` recovery row.
 */
export async function automationStudioStepEntry(ctx: AutomationStudioStepLoopContext, defaultNode: AutomationStudioFlowNode): Promise<AutomationStudioFlowNode> {
  const contract = automationStudioSubflowContract(ctx.flow);
  if (!contract.entries.length) return defaultNode;
  const invocation = ctx.options.invocation;
  const inputs = invocation?.frame.inputs ?? ctx.options.inputs ?? {};
  const unreadable = (nodeId: string) => contract.problems.some((problem) => problem.startsWith(`nodes.${nodeId}.metadata.${AUTOMATION_STUDIO_SUBFLOW_CONTRACT_KEYS.entry}`));
  const entries = contract.entries.filter((entry) => ctx.nodesById.has(entry.nodeId) && !unreadable(entry.nodeId));
  const observation = await observeAutomationStudioFacts({
    hostRuntime: ctx.options.hostRuntime,
    groups: entries.map((entry) => ({ key: entry.id, conditions: entry.when })),
    context: { inputs, values: ctx.values, nodeId: defaultNode.id, ...(ctx.options.signal ? { signal: ctx.options.signal } : {}) },
    now: ctx.now
  });
  if (observation.problem && invocation && !invocation.run.lifecycle.problems.includes(observation.problem)) invocation.run.lifecycle.problems.push(observation.problem);
  const selection = selectAutomationStudioEntry({ entries, defaultNodeId: defaultNode.id, whenResults: observation.results, bound: boundNames(inputs) });
  const chosen = selection.kind === "entry" ? ctx.nodesById.get(selection.nodeId) : undefined;
  if (selection.kind !== "entry" || !chosen) {
    ctx.lifecycle.entry = { kind: "default", evidence: [] };
    return defaultNode;
  }
  ctx.lifecycle.entry = { kind: "entry", id: selection.id, evidence: (observation.results.get(selection.id) ?? []).map(automationStudioConditionEvidence) };
  if (invocation) {
    invocation.frame.entry = { kind: "entry", id: selection.id };
    invocation.frame.cursor = { nodeId: chosen.id, phase: invocation.frame.cursor.phase === "handler" ? "handler" : "before_attempt" };
  }
  // The step loop starts at the entry: its first arrival is there.
  ctx.arrival = { nodeId: chosen.id, attempts: 0, consumed: new Set(), ordinal: (ctx.lifecycle.arrivals.get(chosen.id) ?? 0) + 1 };
  ctx.lifecycle.arrivals.set(chosen.id, ctx.arrival.ordinal);
  emitAutomationStudioActivityStepRecovery({ nodeId: chosen.id, recovery: { kind: "entry", subject: chosen.label ?? "", outcome: "succeeded", targetId: selection.id } });
  return chosen;
}

/** The input names that hold a value: a `requires` name is bound only when its input is neither absent nor null. */
function boundNames(inputs: Readonly<Record<string, JsonValue>>): Set<string> {
  return new Set(Object.entries(inputs).filter(([, value]) => value !== undefined && value !== null).map(([name]) => name));
}
