import type { JsonObject } from "../../../../../core/index.ts";

/**
 * The one rule by which a read's own `recordOutput.process` and the processing held over it meet (`./feed.ts`
 * header): the held keys over the read's, key by key; `undefined` where neither says anything. The legacy path holds
 * what `core.set_result_processing` set; the automatic data stage (`./stage.ts`) holds the task's declaration.
 */
export function automationStudioAnswerFirstMergedProcessing(own: unknown, held: unknown): unknown {
  if (held === undefined) return own;
  return isObject(own) && isObject(held) ? { ...own, ...held } : held;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
