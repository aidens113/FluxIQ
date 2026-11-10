import type { FlowOutline } from "../wire";

/** Steps a new step is never added after: endings and headings. */
const NOT_BEFORE = new Set(["give-back", "end", "handlers", "section", "jump", "empty"]);

/**
 * Where "Add a step" at the foot of the list puts the new step: after the last top-level step
 * that does something, so it lands before "Give back …" rather than after the Flow ends.
 * Undefined puts it first (a Flow with nothing in it yet).
 */
export function appendPoint(outline: FlowOutline): string | undefined {
  for (let index = outline.steps.length - 1; index >= 0; index -= 1) {
    const step = outline.steps[index];
    if (step && step.number && !NOT_BEFORE.has(step.kind)) return step.number;
  }
  return undefined;
}
