import { defineBuiltinNode } from "../shared/definition";

export const endNode = defineBuiltinNode({
  id: "builtin.control.end",
  label: "End",
  description: "Terminal point for a policy or routine graph.",
  class: "control-flow",
  scope: "both",
  inputs: [{ id: "in", label: "In", valueType: "any" }],
  outputs: [],
  parameters: [
    {
      id: "resultStatus",
      label: "Final result",
      description: "How this policy or routine should be marked when execution reaches this End node.",
      valueType: "string",
      defaultValue: "success",
      options: [
        { label: "Success", value: "success" },
        { label: "Failed", value: "failed" },
        { label: "Skipped", value: "skipped" }
      ]
    },
    { id: "message", label: "End note", description: "Optional text saved with the final result.", valueType: "string", defaultValue: "", ui: { control: "textarea", placeholder: "Optional note for this ending" } }
  ],
  icon: "circle-stop",
  execute: (context) => ({ status: context.parameters.resultStatus === "failed" ? "failed" : context.parameters.resultStatus === "skipped" ? "skipped" : "success", route: "end", outputs: { message: context.parameters.message ?? "" } })
});
