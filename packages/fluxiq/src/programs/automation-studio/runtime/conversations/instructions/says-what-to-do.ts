// Whether a person's words say what to do, or only which capability to start.
//
// "automate this page" names the capability and says nothing about what the
// automation should do; "Find every pair of wireless earbuds under $50" says
// it. Read in two places: a required instruction nothing supplied is taken from
// the message only when it says what to do (`./invocation.ts`), and explore
// replaces a Flow's saved goal with the person's own words only then
// (`../commands/explore.ts`, t349).

import type { AutomationStudioPanelCapability } from "../../panel-capabilities/index.ts";
import { automationStudioNameWords } from "./closest.ts";

/** A message with fewer words than this once the capability's own name and phrases are set aside asks to start something, and does not say what. */
const INSTRUCTION_MIN_WORDS = 3;

export function automationStudioConversationSaysWhatToDo(capability: Pick<AutomationStudioPanelCapability, "title" | "phrases">, words: string): boolean {
  const named = new Set([capability.title, ...capability.phrases].flatMap(automationStudioNameWords));
  return automationStudioNameWords(words).filter((word) => !named.has(word)).length >= INSTRUCTION_MIN_WORDS;
}
