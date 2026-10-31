// A layer a trial pass met and the run closed becomes a handler of the next
// submission (P6 item 3, t799), the same handler an explored close gets
// (`./explored.ts`), written from what the trial's attempt recorded
// (`../explored-interruptions.ts`): the layer's name, the definition of the step
// that pressed its way out and the client's durable target for that press.
//
// - scope: the part, as every handler here.
// - `when` the layer is visible by its name: the `obstruction` fact for a layer
//   that carried an `id`, else the `dialog` fact (CC7, I3).
// - no `completionCheck`: the client's own defence has closed the layer once,
//   and nothing here claims to know what proves it gone.
// - one step: that press again, run with the recorded `controlRef` as its
//   parameters, declaring nothing lasting. `controlRef` is the parameters the
//   domain resolved for the press, the same form an explored press records
//   (`draft.ranWith.parameters`); written as a `target` alone it would lack what
//   the domain fills in at resolution, the plan's check would refuse it, and
//   the handler would be dropped (t799 headed proof).

import type { AutomationStudioRuntimeAddHandlerPatch } from "../../llm/index.ts";
import type { AutomationStudioTrialInterruption } from "../explored-interruptions.ts";
import { automationStudioLayerHandlerPatch } from "./patch.ts";

/** What a handler learned from a trial says it came from. */
export const AUTOMATION_STUDIO_TRIAL_CLOSE_LEARNED_FROM = "trial_close";

/** What the handler's nodes say; generic words, never the page's. */
const WORDS = {
  press: "Close what covered the page",
  reason: "A trial run met something that covered the page and closed it. When it is there again, the Flow closes it the same way and carries on."
} as const;

/** The fact a layer is waited for by: `obstruction` when it carried an id, else `dialog` (header). */
export function automationStudioLayerFact(layer: { id?: string | undefined }): "obstruction" | "dialog" {
  return layer.id ? "obstruction" : "dialog";
}

/** The handler for one layer a trial closed (header). */
export function automationStudioTrialLayerHandlerPatch(layer: AutomationStudioTrialInterruption): AutomationStudioRuntimeAddHandlerPatch {
  return automationStudioLayerHandlerPatch({
    scope: { kind: "subflow", inherit: false },
    shown: { fact: automationStudioLayerFact(layer), op: "visible", value: layer.name },
    press: { definitionId: layer.wayOutDefinitionId, label: WORDS.press, parameters: structuredClone(layer.controlRef) },
    reason: WORDS.reason,
    metadata: { learnedFrom: AUTOMATION_STUDIO_TRIAL_CLOSE_LEARNED_FROM, ...(layer.id ? { layerId: layer.id } : {}) }
  });
}
