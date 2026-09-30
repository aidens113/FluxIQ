import { emitAutomationStudioActivity } from "./emit.ts";
import { automationStudioActivityAction, automationStudioActivityHumanLabel } from "./wording/index.ts";

/**
 * Says the executor is about to run one node: "Running step N of M: action".
 * `count` is how many nodes the Flow has; a loop can take a run past it, and
 * then the sentence says "step N" plainly rather than a count it has passed.
 *
 * The action is the node's authored label, which the panel already shows, or
 * else what its definition id names with the element name its parameters
 * already carry ("Clicking “Get a free quote”"). A label that is an id is not
 * an authored label and is dropped. With neither, the sentence is "Running
 * step N of M" and nothing more: the node id goes to `detail.ref` only.
 */
export function emitAutomationStudioActivityStep(input: { index: number; count: number; nodeId: string; label?: string | undefined; definitionId?: string | undefined; parameters?: unknown }): void {
  const label = automationStudioActivityHumanLabel(input.label, 160);
  const action = automationStudioActivityAction({ id: input.definitionId, parameters: input.parameters, label });
  const counted = input.index <= input.count ? `step ${input.index} of ${input.count}` : `step ${input.index}`;
  emitAutomationStudioActivity({
    phase: "running",
    label: `Running ${counted}${action ? `: ${action}` : ""}`,
    step: { index: input.index, count: input.count, nodeId: input.nodeId, ...(label ? { label } : {}) },
    detail: { kind: "step", title: action ?? `S${counted.slice(1)}`, status: "started", ref: input.nodeId }
  });
}
