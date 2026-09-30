import { emitAutomationStudioActivity } from "./emit.ts";

/**
 * Says the executor is about to run one node: "Running step N of M: label".
 * `count` is how many nodes the Flow has; a loop can take a run past it, and
 * then the sentence says "step N" plainly rather than a count it has passed.
 * The label is the node's authored label, which the panel already shows.
 */
export function emitAutomationStudioActivityStep(input: { index: number; count: number; nodeId: string; label?: string | undefined }): void {
  const label = input.label?.trim() ?? "";
  const counted = input.index <= input.count ? `step ${input.index} of ${input.count}` : `step ${input.index}`;
  emitAutomationStudioActivity({
    phase: "running",
    label: `Running ${counted}${label ? `: ${label}` : ""}`,
    step: { index: input.index, count: input.count, nodeId: input.nodeId, ...(label ? { label } : {}) },
    detail: { kind: "step", title: label || input.nodeId, status: "started", ref: input.nodeId }
  });
}
