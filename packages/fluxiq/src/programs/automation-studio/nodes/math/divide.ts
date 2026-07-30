import { binaryNumbers } from "./shared";
import { defineBuiltinNode, emptyResult } from "../shared/definition";

export const divideNode = defineBuiltinNode({
  id: "builtin.math.divide",
  label: "Divide",
  description: "Divide one numeric value by another.",
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
    return right === 0 ? { status: "failed", outputs: { result: null } } : emptyResult({ result: left / right });
  }
});
