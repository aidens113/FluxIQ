// What a refused completion's feedback may put on a history row.
//
// The feedback a completion check writes (`refused()` in
// `../harness-options/bootstrap-completion.ts`) is for the decision right after
// it: issues with their messages, the previous script, the shapes a refused
// parameter accepts, and an instruction. A row that stays in front of the model
// for the rest of the build carries none of that. It carries the codes: the
// feedback's `code`, `refusal` and `refusals`, and from each account of what is
// missing (`missingActs`, `limitsExceeded`, `cannotReach`, ...) the fields whose
// values are closed codes or integers -- an act's id and reason, a limit's name
// and count.
//
// **Never a sentence, never page text, never model input.** A string with a
// space in it is dropped, whatever key it sits under; so is every field of a
// key this does not read. `issues` is not read: its codes are the completion's
// issue codes, which the row carries already, and its messages are sentences.
// `previous` and `instruction` are prose.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { automationStudioLlmDecisionContextClosedCode } from "./closed-code.ts";

// Every account object and every closed field of each is kept: there is no
// count limit on what a row carries (`../context-window.ts`).

/** Keys read as codes at the top of the feedback. */
const CODE_KEYS = ["code", "refusal"] as const;
/** Keys never read as accounts: sentences, or codes the row carries already. */
const UNREAD_KEYS = new Set(["code", "refusal", "refusals", "issues", "previous", "instruction", "ok"]);
const FIELD_NAME = /^[a-z][a-z0-9_]{0,39}$/i;

/** The feedback's closed codes, or nothing when it has none. */
export function automationStudioLlmDecisionContextClosedDetail(feedback: unknown): JsonObject | undefined {
  if (!isObject(feedback)) return undefined;
  const detail: JsonObject = {};
  for (const key of CODE_KEYS) {
    const code = automationStudioLlmDecisionContextClosedCode(feedback[key]);
    if (code) detail[key] = code;
  }
  if (Array.isArray(feedback.refusals)) {
    const refusals = feedback.refusals.flatMap((value) => automationStudioLlmDecisionContextClosedCode(value) ?? []);
    if (refusals.length) detail.refusals = refusals;
  }
  for (const [key, value] of Object.entries(feedback)) {
    if (UNREAD_KEYS.has(key) || !FIELD_NAME.test(key)) continue;
    // An account is a list of objects; one written as a single object is a
    // list of one.
    const objects = (Array.isArray(value) ? value : [value]).flatMap((item: unknown) => isObject(item) ? [item] : []);
    const kept = objects.flatMap((item) => {
      const fields = closedFields(item);
      return fields ? [fields] : [];
    });
    if (!kept.length) continue;
    detail[key] = kept;
  }
  return Object.keys(detail).length ? detail : undefined;
}

/** An object's fields whose names and values are closed. */
function closedFields(item: { [key: string]: JsonValue | undefined }): JsonObject | undefined {
  const fields: JsonObject = {};
  let count = 0;
  for (const [key, value] of Object.entries(item)) {
    if (!FIELD_NAME.test(key)) continue;
    const kept = Number.isInteger(value) ? value as number : automationStudioLlmDecisionContextClosedCode(value);
    if (kept === undefined) continue;
    fields[key] = kept;
    count += 1;
  }
  return count ? fields : undefined;
}

function isObject(value: unknown): value is { [key: string]: JsonValue | undefined } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
