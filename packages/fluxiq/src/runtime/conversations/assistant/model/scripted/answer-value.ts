import type { JsonValue } from "../../../../../core/index.ts";

/** The key a script's value uses to say "read this from what the last tool answered". */
export const PANEL_ASSISTANT_SCRIPT_ANSWER_KEY = "$answer";

/**
 * `value` with every `{"$answer": "a.b"}` replaced by the value at that path in
 * `answer`. A path that leads nowhere is an error in plain words: a script that
 * guessed would pass for the wrong reason.
 */
export function panelAssistantScriptedValue(value: JsonValue, answer: JsonValue | undefined): JsonValue {
  if (Array.isArray(value)) return value.map((entry) => panelAssistantScriptedValue(entry, answer));
  if (value === null || typeof value !== "object") return value;
  const path = value[PANEL_ASSISTANT_SCRIPT_ANSWER_KEY];
  if (typeof path === "string" && Object.keys(value).length === 1) return readAnswerAt(path, answer);
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, panelAssistantScriptedValue(nested, answer)]));
}

function readAnswerAt(path: string, answer: JsonValue | undefined): JsonValue {
  let at: JsonValue | undefined = answer;
  for (const segment of path.split(".")) {
    if (at === null || at === undefined || typeof at !== "object") at = undefined;
    else at = Array.isArray(at) ? at[Number(segment)] : at[segment];
  }
  if (at === undefined) throw new Error(`The script reads “${path}” from the last answer, and the last answer has nothing there.`);
  return at;
}
