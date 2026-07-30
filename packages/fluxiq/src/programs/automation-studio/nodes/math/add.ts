import { binaryNumbers } from "./shared";
import { defineBuiltinNode, emptyResult } from "../shared/definition";

export const addNode = defineBuiltinNode({
  id: "builtin.math.add",
  label: "Add",
  description: "Add two numeric values.",
  class: "math",
  scope: "both",
  inputs: [
    { id: "left", label: "Left", valueType: "number", required: true },
    { id: "right", label: "Right", valueType: "number", required: true }
  ],
  outputs: [{ id: "result", label: "Result", valueType: "number" }],
  parameters: [],
  icon: "calculator",
  execute: (context) => {
    const [left, right] = binaryNumbers(context);
    return emptyResult({ result: left + right });
  }
});
