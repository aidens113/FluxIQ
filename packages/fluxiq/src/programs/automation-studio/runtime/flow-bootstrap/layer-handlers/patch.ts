// The one handler Core writes, with no model, for a layer that got in the way
// and was closed: when the layer shows, press its way out, check it is gone,
// then carry on with the step (t516, t787).
//
// Two places write it. A run whose client defence closed a layer while a step
// succeeded learns it as an in-run repair
// (`../../service/runtime-session/interruption-handler.ts`), scoped to that
// step and waiting for the layer by its name. A build whose own exploration
// press cleared a layer gives the submitted Flow one
// (`./explored.ts`), scoped to each part and waiting for the
// control the press used. What the layer is shown by, and what proves it gone,
// is each caller's; the shape is this one:
//
// - `before` each attempt in its scope, `when` the layer shows. No wait is
//   written (supervisor, 2026-10-13): a wait would slow every run for a layer
//   that may never come, and the defence stays the backup for one that opens
//   after the guard was read.
// - one step pressing the way out; it declares no lasting consequence, since a
//   way out pressed with nobody to ask is one that commits nothing.
// - `completionCheck`: the layer is gone.
// - `resume`: the step then runs as it would have.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFactCondition } from "../../executor/lifecycle/index.ts";
import type { AutomationStudioRuntimeAddHandlerPatch, AutomationStudioRuntimePatchHandlerScope } from "../../llm/index.ts";

/** The handler for a layer shown by `shown` and gone by `gone`, closed by `press` (header). */
export function automationStudioLayerHandlerPatch(input: {
  scope: AutomationStudioRuntimePatchHandlerScope;
  shown: AutomationStudioFactCondition;
  /** What proves the layer gone; absent for a handler that writes no check (a close a trial learned, `./trial.ts`). */
  gone?: AutomationStudioFactCondition | undefined;
  press: { definitionId: string; label: string; parameters: JsonObject };
  reason: string;
  metadata: JsonObject;
}): AutomationStudioRuntimeAddHandlerPatch {
  return {
    kind: "add_handler",
    event: "before",
    scope: structuredClone(input.scope),
    when: [structuredClone(input.shown)],
    ...(input.gone ? { completionCheck: [structuredClone(input.gone)] } : {}),
    steps: [{ definitionId: input.press.definitionId, label: input.press.label, parameters: structuredClone(input.press.parameters) }],
    then: { kind: "resume" },
    consequences: [],
    reason: input.reason,
    metadata: structuredClone(input.metadata)
  };
}
