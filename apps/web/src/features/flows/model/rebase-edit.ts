import type { FlowOutline, OutlineStep, StepEdit } from "../wire";

/**
 * The same edit, renumbered for the Flow as it is now. An edit names steps by the numbers the
 * person saw; after someone else changed the Flow those numbers may point at other steps, so
 * each is found again by the node it is about. A step that is gone is said, not guessed.
 */
export function rebaseEdit(edit: StepEdit, before: FlowOutline, after: FlowOutline): { ok: true; edit: StepEdit } | { ok: false; reason: string } {
  const renumber = (number: string): string | { gone: string } => {
    const node = findStep(before.steps, number)?.nodeIds[0];
    const now = node === undefined ? undefined : findStepByNode(after.steps, node);
    return now?.number ? now.number : { gone: number };
  };
  if (edit.kind === "add-call" || edit.kind === "add-data") {
    if (edit.after === undefined) return { ok: true, edit };
    const place = renumber(edit.after);
    if (typeof place !== "string") return { ok: false, reason: `Step ${place.gone} is no longer in this Flow, so there is nowhere to add your step after it.` };
    return { ok: true, edit: { ...edit, after: place } };
  }
  const step = renumber(edit.step);
  if (typeof step !== "string") return { ok: false, reason: `Step ${step.gone} is no longer in this Flow, so your change cannot be made again.` };
  return { ok: true, edit: { ...edit, step } };
}

function walk(steps: readonly OutlineStep[]): OutlineStep[] {
  return steps.flatMap((step) => [step, ...walk(step.children), ...step.arms.flatMap((arm) => walk(arm.steps))]);
}

function findStep(steps: readonly OutlineStep[], number: string): OutlineStep | undefined {
  return walk(steps).find((step) => step.number === number);
}

function findStepByNode(steps: readonly OutlineStep[], nodeId: string): OutlineStep | undefined {
  return walk(steps).find((step) => step.nodeIds[0] === nodeId);
}
