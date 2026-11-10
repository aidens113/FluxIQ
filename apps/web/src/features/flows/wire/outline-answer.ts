import { asRecord, numberOf } from "../../home/model";
import { parseOutline } from "./parse-outline";
import type { OutlineAnswer } from "./types";

/** `get-flow-outline`'s payload, or undefined when it is not a list with a version number. */
export function outlineAnswer(payload: unknown): OutlineAnswer | undefined {
  const row = asRecord(payload);
  const outline = parseOutline(row?.outline);
  const revision = numberOf(row?.revision);
  if (!outline || revision === undefined) return undefined;
  return { outline, revision };
}
