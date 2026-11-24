// The host's statement of the options that stood chosen as a press found the
// page (`../../flow-authoring/draft/step.ts`, `chosen`, t1023), read off a
// call's draft statement (`../evidence-loop-decision.ts`).
import type { JsonObject, JsonValue } from "../../../core/index.ts";
import { automationStudioFlowDraftControlWords, type AutomationStudioFlowDraftStepChosen } from "../../flow-authoring/draft/index.ts";

/** The most options one statement of what stood chosen may hold, as the host bounds it. */
const MOST_CHOSEN = 16;
/** The longest `at` one option may carry, as JSON text: an address and an identity, never a page. */
const MOST_AT_LENGTH = 8_000;

/**
 * The options that stood chosen as a press found it, or nothing when there are
 * none to carry: a list of at most sixteen, each with `key` and `words` and,
 * where the host says it, `at`. The key is a code (`isCode`, the statement's
 * own rule) Core compares and never reads; the words are plain and shown in the
 * call's own evidence (`../../flow-authoring/draft/control-words.ts`); `at` is
 * a non-empty plain object of bounded size, carried unread (t1030: what finds
 * the control again, which a saved act's precondition needs). A bad entry,
 * a bad `at` included, is withheld and the rest kept; a list past sixteen is
 * no statement this reads, and is withheld whole.
 */
export function automationStudioLlmDraftStatementChosen(value: unknown, evidence: JsonValue, isCode: (value: unknown) => value is string): AutomationStudioFlowDraftStepChosen[] | undefined {
  if (!Array.isArray(value) || value.length > MOST_CHOSEN) return undefined;
  const options: AutomationStudioFlowDraftStepChosen[] = [];
  for (const option of value) {
    if (typeof option !== "object" || option === null || Array.isArray(option)) continue;
    const entry = option as Record<string, unknown>;
    if (Object.keys(entry).some((key) => key !== "key" && key !== "words" && key !== "at") || !isCode(entry.key)) continue;
    const at = entry.at === undefined ? undefined : atOf(entry.at);
    if (entry.at !== undefined && at === undefined) continue;
    const words = automationStudioFlowDraftControlWords(entry.words, evidence);
    if (words !== undefined) options.push({ key: entry.key, words, ...(at ? { at } : {}) });
  }
  return options.length ? options : undefined;
}

/**
 * A copy of a non-empty plain JSON object no longer than the bound; anything
 * else is no `at`. The statement was read from JSON, so it serializes.
 */
function atOf(value: unknown): JsonObject | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.keys(value).length === 0) return undefined;
  const text = JSON.stringify(value);
  return text.length <= MOST_AT_LENGTH ? JSON.parse(text) as JsonObject : undefined;
}
