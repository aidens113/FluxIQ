// The host's statement of the options that stood chosen as a press found the
// page (`../../flow-authoring/draft/step.ts`, `chosen`, t1023), read off a
// call's draft statement (`../evidence-loop-decision.ts`).
import type { JsonValue } from "../../../core/index.ts";
import { automationStudioFlowDraftControlWords, type AutomationStudioFlowDraftStepChosen } from "../../flow-authoring/draft/index.ts";

/** The most options one statement of what stood chosen may hold, as the host bounds it. */
const MOST_CHOSEN = 16;

/**
 * The options that stood chosen as a press found it, or nothing when there are
 * none to carry: a list of at most sixteen, each with only `key` and `words`,
 * the key a code (`isCode`, the statement's own rule) Core compares and never
 * reads, the words plain and shown in the call's own evidence
 * (`../../flow-authoring/draft/control-words.ts`). A bad entry is withheld and
 * the rest kept; a list past sixteen is no statement this reads, and is
 * withheld whole.
 */
export function automationStudioLlmDraftStatementChosen(value: unknown, evidence: JsonValue, isCode: (value: unknown) => value is string): AutomationStudioFlowDraftStepChosen[] | undefined {
  if (!Array.isArray(value) || value.length > MOST_CHOSEN) return undefined;
  const options: AutomationStudioFlowDraftStepChosen[] = [];
  for (const option of value) {
    if (typeof option !== "object" || option === null || Array.isArray(option)) continue;
    const entry = option as Record<string, unknown>;
    if (Object.keys(entry).some((key) => key !== "key" && key !== "words") || !isCode(entry.key)) continue;
    const words = automationStudioFlowDraftControlWords(entry.words, evidence);
    if (words !== undefined) options.push({ key: entry.key, words });
  }
  return options.length ? options : undefined;
}
