// The named record output a read writes its rows to (`../result/types.ts`, `Writes`), from the input it was written
// with (a call's value, a draft step's input): its `recordOutput`'s dataset, and whether it appends (`writeMode:
// "append"`) or starts the output over. Read from the step's own words, as the saved Flow's record output will be.
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioAnswerFirstResultWrites } from "../result/index.ts";

/** The output `input` writes, or `undefined` where it names none. */
export function automationStudioAnswerFirstResultWritesOf(input: JsonObject): AutomationStudioAnswerFirstResultWrites | undefined {
  const parameters = isObject(input.parameters) ? input.parameters : undefined;
  const output = isObject(parameters?.recordOutput) ? parameters.recordOutput : isObject(input.recordOutput) ? input.recordOutput : undefined;
  const datasetId = output?.datasetId;
  return typeof datasetId === "string" && datasetId.trim() ? { datasetId, append: output?.writeMode === "append" } : undefined;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
