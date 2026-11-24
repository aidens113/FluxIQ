// The host's statement of what a press changed on the page it stayed on
// (`../../flow-authoring/draft/step.ts`, `changed`, week report W1), read off a
// call's draft statement (`../evidence-loop-decision.ts`).
import type { JsonValue } from "../../../core/index.ts";
import { automationStudioFlowDraftControlWords, type AutomationStudioFlowDraftStepChange } from "../../flow-authoring/draft/index.ts";

/** The most lines one statement of what a press changed may hold, as the host bounds it. */
const MOST_CHANGED_LINES = 16;
const CHANGE_HOWS: ReadonlySet<unknown> = new Set<AutomationStudioFlowDraftStepChange["how"]>(["appeared", "went", "reads", "rose"]);

/**
 * The lines a press changed, or nothing when there are none to carry: a list
 * of at most sixteen, each with only `words` and `how`, its words plain and
 * shown in the call's own evidence (`../../flow-authoring/draft/control-words.ts`)
 * and `how` one of the four. A bad line is withheld and the rest kept; a list
 * past sixteen is no statement this reads, and is withheld whole.
 */
export function automationStudioLlmDraftStatementChanged(value: unknown, evidence: JsonValue): AutomationStudioFlowDraftStepChange[] | undefined {
  if (!Array.isArray(value) || value.length > MOST_CHANGED_LINES) return undefined;
  const lines: AutomationStudioFlowDraftStepChange[] = [];
  for (const line of value) {
    if (typeof line !== "object" || line === null || Array.isArray(line)) continue;
    const entry = line as Record<string, unknown>;
    if (Object.keys(entry).some((key) => key !== "words" && key !== "how") || !CHANGE_HOWS.has(entry.how)) continue;
    const words = automationStudioFlowDraftControlWords(entry.words, evidence);
    if (words !== undefined) lines.push({ words, how: entry.how as AutomationStudioFlowDraftStepChange["how"] });
  }
  return lines.length ? lines : undefined;
}
