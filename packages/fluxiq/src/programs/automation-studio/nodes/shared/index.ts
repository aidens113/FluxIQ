// Compatibility exports; the framework owns this implementation.
export {
  defineBuiltinNode,
  controlInput,
  successOutput,
  failedOutput,
  errorOutput,
  dataOutput,
  branchOutput,
  successFailureOutputs,
  visualNodeInputs,
  emptyResult,
  failedResult,
  inputValue,
  numberValue,
  booleanValue,
  arrayValue,
  stringValue,
  objectValue,
  jsonValue,
  compareBasic,
  getPathValue,
  setPathValue
} from "../../../../components/automation/shared/index.ts";
export type {
  AutomationNodeDefinitionInput
} from "../../../../components/automation/shared/index.ts";
