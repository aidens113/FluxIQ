// A person's words on an act (plan D6): `acts()` must pass
// `parseAutomationStudioAttemptAct`, whose word check the contract keeps to itself
// (`packages/contracts/src/task-attempts/person-words.ts`). So the words are put to
// the parser itself and a generic line stands in for what it refuses, rather than a
// second copy of its rule that could drift from it.
//
// What this cannot do is tell words copied off a page from words a person wrote, as
// the contract says. So the lines a caller does not give are said by class alone, and
// a press's control name is never used by default: it is page text.

import { parseAutomationStudioAttemptAct, type AutomationStudioAttemptActClass } from "@fluxiq/contracts/automation";

/** What each class of act did, generically, most consequential first. */
const CLASS_WORDS: ReadonlyArray<[AutomationStudioAttemptActClass, string]> = [
  ["move_money", "Moved money"],
  ["delete", "Deleted something"],
  ["send_or_publish", "Sent or published something"],
  ["modify_existing", "Changed something that was already there"],
  ["create_new", "Made something new"]
];
const NO_CLASS_WORDS = "Pressed a control that changed the page";
const WHERE_WORDS = "On the site";

/** The words of an act: each as given, or the generic line where the parser refuses it or nothing was given (header). */
export function automationStudioAttemptActScreenedWords(words: { what?: string | undefined; where?: string | undefined }, classes: readonly string[]): { what: string; where: string } {
  return {
    what: accepted(words.what, "what") ?? CLASS_WORDS.find(([known]) => classes.includes(known))?.[1] ?? NO_CLASS_WORDS,
    where: accepted(words.where, "where") ?? WHERE_WORDS
  };
}

function accepted(words: string | undefined, field: "what" | "where"): string | undefined {
  if (words === undefined) return undefined;
  const trimmed = words.trim();
  const parsed = parseAutomationStudioAttemptAct({ id: "act.words", what: NO_CLASS_WORDS, where: WHERE_WORDS, classes: [], state: "landed", [field]: trimmed });
  return parsed.ok ? trimmed : undefined;
}
