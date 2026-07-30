import { binaryNumbers } from "./shared";
import { defineBuiltinNode, emptyResult } from "../shared/definition";

export const multiplyNode = defineBuiltinNode({
  id: "builtin.math.multiply",
  label: "Multiply",
  description: "Multiply two numeric values.",
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
    return emptyResult({ result: left * right });
  }
});
