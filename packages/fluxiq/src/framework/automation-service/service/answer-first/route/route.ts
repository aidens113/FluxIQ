// Where a new attempt at a task starts (t870, design "Route"). It never throws: a task must not
// stop for its memory.
//
//   nothing saved for this exact task            build, with any notes
//   a best Flow whose steps assemble now         use
//   a best Flow whose steps do not (or `assemble` throws)  repair, seeded with them, never run
//
// The caller gives `assemble`, the same check a draft's save uses, so the steps are checked
// against the Flow as it stands and not against a digest that may be stale.

import type { AutomationStudioFlowDraftStep } from "../../../../../runtime/flow-authoring/draft/index.ts";
import type { AutomationStudioAnswerFirstTaskMemory } from "../task-memory/index.ts";
import type { AutomationStudioAnswerFirstRoute } from "./route-type.ts";

const WHY = "The saved steps no longer fit together as a Flow on this site as it stands.";

export function automationStudioAnswerFirstRoute(input: {
  memory: AutomationStudioAnswerFirstTaskMemory | undefined;
  projectId: string;
  flowId: string;
  taskId: string;
  assemble(steps: AutomationStudioFlowDraftStep[]): { ok: true } | { ok: false; codes: readonly string[] };
  related?: { steps: AutomationStudioFlowDraftStep[]; flowId: string } | undefined;
}): AutomationStudioAnswerFirstRoute {
  const notes = Array.isArray(input.memory?.notes) ? [...input.memory.notes] : [];
  const saved = input.memory?.best;
  if (!saved || !Array.isArray(saved.steps) || saved.steps.length === 0) {
    return { kind: "build", notes, ...(input.related ? { related: input.related } : {}) };
  }
  let assembled = false;
  try {
    assembled = input.assemble(saved.steps).ok === true;
  } catch {
    assembled = false;
  }
  return assembled ? { kind: "use", saved, notes } : { kind: "repair", saved, notes, why: WHY };
}
