// The node that ends a handler's body and says how the run continues
// (state-aware recovery plan, C5), with the disposition vocabulary and the
// phase table the validator and the dispatcher both apply.
//
// It also names the node metadata a Route's target is declared under (C2),
// because a `route` disposition is the one reader of a checkpoint id that the
// Flow validator, which imports no runtime module, must resolve.

import type { JsonObject } from "../../../../core/index.ts";
import { defineBuiltinNode } from "../shared/definition.ts";
import type { AutomationStudioLifecycleEvent } from "./handler.ts";

/** The node definition that ends a handler body. */
export const AUTOMATION_STUDIO_HANDLER_END_DEFINITION_ID = "builtin.control.handler-end";

/** How a handler body may end (C5). */
export const AUTOMATION_STUDIO_HANDLER_DISPOSITIONS = Object.freeze(["resume", "route", "resolve", "unhandled"] as const);

/** One way a handler body may end. */
export type AutomationStudioHandlerDispositionKind = (typeof AUTOMATION_STUDIO_HANDLER_DISPOSITIONS)[number];

/**
 * The versioned graph metadata of a Subflow contract (C2). Each key is read
 * flat off `metadata`: a node's `metadata["fluxiq.entry"]` and
 * `metadata["fluxiq.checkpoint"]`, the graph's `metadata["fluxiq.successCheck"]`,
 * and a node's `metadata.replay`, which may only tighten the replay restriction
 * derived from the side-effect model.
 */
export const AUTOMATION_STUDIO_SUBFLOW_CONTRACT_KEYS = Object.freeze({
  entry: "fluxiq.entry",
  checkpoint: "fluxiq.checkpoint",
  successCheck: "fluxiq.successCheck",
  replay: "replay"
} as const);

/**
 * Whether a body may end with this disposition at this event, the static half
 * of C5's table:
 *
 * - `resume` is refused at `fail`, where no success continuation exists;
 * - `resolve` is allowed only at `fail`, where it stands in for the outputs the
 *   failed node did not produce;
 * - `route` and `unhandled` are allowed everywhere.
 *
 * The run-time half (a completion check that is not `true`, a checkpoint whose
 * facts do not hold, an uncertain act in the way) is decided by
 * `runtime/executor/lifecycle/dispositions.ts`.
 */
export function automationStudioDispositionAllowedAt(event: AutomationStudioLifecycleEvent, disposition: AutomationStudioHandlerDispositionKind): boolean {
  if (disposition === "resume") return event !== "fail";
  if (disposition === "resolve") return event === "fail";
  return true;
}

export const handlerEndNode = defineBuiltinNode({
  id: AUTOMATION_STUDIO_HANDLER_END_DEFINITION_ID,
  label: "Handler End",
  description: "Ends a handler's body and says how the run continues.",
  class: "control-flow",
  scope: "both",
  inputs: [{ id: "in", label: "In", valueType: "any" }],
  outputs: [],
  parameters: [
    {
      id: "disposition",
      label: "Then",
      description: "How the run continues once the handler's body has run.",
      valueType: "string",
      defaultValue: "unhandled",
      options: [
        { label: "Carry on with the step", value: "resume" },
        { label: "Go to a checkpoint", value: "route" },
        { label: "Use these outputs instead", value: "resolve" },
        { label: "Not handled here", value: "unhandled" }
      ]
    },
    {
      id: "checkpointId",
      label: "Checkpoint",
      description: "The checkpoint a Route moves the run to, in this part or a part that called it.",
      valueType: "string",
      defaultValue: "",
      ui: { control: "identifier", placeholder: "checkpoint id" }
    },
    {
      id: "outputs",
      label: "Outputs",
      description: "The outputs a Resolve hands on in place of the failed step's; they must cover every output it was required to produce.",
      valueType: "json",
      defaultValue: {}
    }
  ],
  icon: "corner-down-left",
  // Reached only inside a handler body. What the dispatcher reads is the
  // disposition, so the parameters are handed back as they were written.
  execute: (context) => {
    const outputs = context.parameters.outputs;
    return {
      status: "success",
      route: "success",
      outputs: {
        disposition: typeof context.parameters.disposition === "string" ? context.parameters.disposition : "unhandled",
        checkpointId: typeof context.parameters.checkpointId === "string" ? context.parameters.checkpointId : "",
        outputs: outputs && typeof outputs === "object" && !Array.isArray(outputs) ? (outputs as JsonObject) : {}
      }
    };
  }
});
