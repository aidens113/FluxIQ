import type { JsonObject } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_FLOW_DRAFT_ROUTE_PLACE_VALUE } from "../../route-places/index.ts";
import { AUTOMATION_STUDIO_FLOW_DRAFT_EDIT_CHANGES } from "./changes.ts";

/**
 * What the model is shown of the edit shape where the framework drafts the Flow: six words, each
 * about one step by the number the draft shows (`./index.ts`). Every number in one decision is
 * read against the draft as shown.
 */
export const AUTOMATION_STUDIO_FLOW_DRAFT_EDIT_SCHEMA: JsonObject = {
  type: "object",
  additionalProperties: false,
  required: ["step", "change"],
  properties: {
    step: { type: "integer", minimum: 1, description: "The step number shown in the draft. Every number in one decision names the step as the draft shows it; the draft is renumbered once, after the whole decision." },
    change: {
      enum: [...AUTOMATION_STUDIO_FLOW_DRAFT_EDIT_CHANGES],
      description: "keep: put back a step the framework left out (its out line says why). drop: take a step out of the Flow. result: this read holds the answer. repeat: do this step again for each row the step given by over produced, or while the step given by while keeps succeeding; over may name a read that was left out, which then comes in. unrepeat: take the repeat off this step. bind: make a typed value general; input names the parameters to lift, each set to {\"$input\": <name>, \"test\": <value>} for a value that changes between runs, or {\"$row\": <field>} for a field of the row a repeat is on, only for parameters the step already has."
    },
    input: { type: "object", description: "bind only: the parameters to lift, each set to a binding form, at any depth." },
    through: { type: "integer", minimum: 1, description: "repeat only: the last step of the span that repeats. Leave it out to repeat this step alone." },
    over: { type: "integer", minimum: 1, description: "repeat only: the step whose rows the span repeats for, a step before this one. Leave it out for the step before it." },
    while: { type: "integer", minimum: 1, description: "repeat only, never with over: the span's last step, which must answer ended when there is nothing more." },
    most: { type: "integer", minimum: 1, maximum: 10000, description: "repeat only, and only when the instruction itself gives a number: that many passes or rows at most." },
    act: { type: "string", pattern: "^a[1-9][0-9]{0,2}([.][a-z]{1,16})?$", description: "keep only: the act from the acts checklist this step does. Only a step that changes something does an act." },
    place: { type: "string", pattern: AUTOMATION_STUDIO_FLOW_DRAFT_ROUTE_PLACE_VALUE.source, description: "keep only, once the draft shows route: the places on the route this step is on, by their ids." }
  }
};
