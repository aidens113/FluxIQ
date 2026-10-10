import { defineBuiltinNode, failedResult } from "../shared/definition.ts";

/** The Call Subflow node's definition id (state-aware recovery plan, C1). */
export const AUTOMATION_STUDIO_CALL_SUBFLOW_DEFINITION_ID = "builtin.control.call-subflow";

/**
 * Runs a sibling Subflow of the same automation as one step, at its latest
 * revision, and goes on by `success`, `failed`, or `error.<id>` for an error
 * the Subflow declares and `errors` binds.
 *
 * The executor runs it, as a frame of its own
 * (`runtime/executor/frames/call-subflow.ts`), across the same typed boundary
 * a Call Flow node crosses, and never calls `execute`: that answers only a
 * caller running the node on its own, outside any run, where there is no
 * automation to find the Subflow in. Only what `inputs` gives goes in -- each
 * entry the value for one Subflow input, resolved like any parameter, so a
 * state binding reads the parent's value when the step runs -- and only the
 * Subflow's declared outputs and what `outputs` binds come back. The node is
 * run once: its child steps keep their own retries, and re-running the whole
 * Subflow would repeat what they already did.
 */
export const callSubflowNode = defineBuiltinNode({
  id: AUTOMATION_STUDIO_CALL_SUBFLOW_DEFINITION_ID,
  label: "Call Subflow",
  description: "Run another Subflow of this automation as one step, passing values in and out through its declared inputs and outputs.",
  class: "control-flow",
  scope: "both",
  inputs: [{ id: "in", label: "In", valueType: "any" }],
  outputs: [
    { id: "success", label: "Success", valueType: "any" },
    { id: "failed", label: "Failed", valueType: "any" }
  ],
  parameters: [
    { id: "subflowId", label: "Subflow to run", description: "The Subflow of this automation this step runs.", valueType: "string", required: true, ui: { control: "text", placeholder: "Subflow id" } },
    { id: "inputs", label: "Values to pass in", description: "Each of the Subflow's inputs, by its id, and the value it is given: written as is, or bound to a value here, which is read when the step runs.", valueType: "object", defaultValue: {} },
    { id: "outputs", label: "Values to bring back", description: "Each of the Subflow's outputs, by its id, and the name it is kept under here.", valueType: "object", defaultValue: {} },
    { id: "errors", label: "Errors to route", description: "Each error the Subflow declares, by its id, and the name its message is kept under here; the step then goes on by error.<id>.", valueType: "object", defaultValue: {} }
  ],
  icon: "workflow",
  execute: () => ({ ...failedResult(), message: "A Call Subflow step runs only inside a run of its automation." })
});
