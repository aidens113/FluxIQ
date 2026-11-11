import { fluxiqRuntimeTextWithholding } from "../../../../../runtime/index.ts";
import { withheldData } from "./withheld-data.ts";

/** An event's or a result's own ids, enums, digests and times, which the API matches on: never data a secret could reach, kept whole so the protocol still reads. */
const KEPT_TEXT = new Set(["runId", "eventId", "flowId", "stepId", "name", "specHash", "flowPath", "status", "path", "type", "state", "need", "resumeHandle", "correlationId", "overridesDigest"]);
/** An event's or a result's parts that hold only Core's own numbers, ids, pointers and types. */
const KEPT_WHOLE = new Set(["cost", "timings", "pinned", "outputsType", "datasets", "lineage"]);

/**
 * An event or a result as the program and the run's record get it: every occurrence of a secret input's
 * value replaced by `[withheld]` in any text a step, a page, the model or the inputs carried in -- a
 * step's label, a person's reason, a check's inputs and outputs, the result's outputs and verdict, the
 * `ended` event's result -- with the event's and the result's own ids and words kept as they are. Inside
 * data (`outputs`, `inputs`, `records`) every text is withheld, keys too. With no secrets, `value` itself.
 */
export function fluxNodeWithheldForProgram<T>(value: T, secrets: readonly string[]): T {
  const texts = secrets.filter((text) => text !== "");
  if (!texts.length) return value;
  return own(value, fluxiqRuntimeTextWithholding(texts)) as T;
}

/** An event or a result: its own fields kept, everything else withheld as data; an `ended` event's result is a result. */
function own(value: unknown, text: (text: string) => string): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return withheldData(value, text, 0);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (KEPT_WHOLE.has(key) || (KEPT_TEXT.has(key) && typeof item === "string")) return [key, item];
    return [key, key === "result" ? own(item, text) : withheldData(item, text, 0)];
  }));
}
