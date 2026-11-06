// A person's words on an act (plan D6): `acts()` must pass
// `parseAutomationStudioAttemptAct`, whose word check the contract keeps to itself
// (`packages/contracts/src/task-attempts/person-words.ts`). So the words are put to
// the parser itself and a generic line stands in for what it refuses, rather than a
// second copy of its rule that could drift from it.
//
// What this cannot do is tell words copied off a page from words a person wrote, as
// the contract says. So the lines a caller does not give are said by class alone, and
// a press's control name stands in only where nothing gave the words (`./control-name.ts`), screened like any.

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

/**
 * The words of an act: each as given, or the generic line where the parser refuses it or nothing was given (header).
 * `item` is the few words of the listing the act was on (`./item-names.ts`): said after what was done, and left off
 * as a whole where the parser refuses the line with it, or where it only says the same again ("Save: Save"), so the
 * act is never worse for naming its item.
 */
export function automationStudioAttemptActScreenedWords(words: { what?: string | undefined; where?: string | undefined }, classes: readonly string[], item?: string | undefined, control?: string | undefined): { what: string; where: string } {
  // `control` is the control's own word from its fingerprint (`./control-name.ts`), said before the class's line where
  // nothing gave the words: a Save is "Save", not "Changed something that was already there". Screened as any words are.
  const what = accepted(words.what, "what") ?? accepted(control, "what") ?? CLASS_WORDS.find(([known]) => classes.includes(known))?.[1] ?? NO_CLASS_WORDS;
  return {
    what: (item === undefined || item.trim().toLowerCase() === what.toLowerCase() ? undefined : accepted(`${what}: ${item}`, "what")) ?? what,
    where: accepted(words.where, "where") ?? WHERE_WORDS
  };
}

function accepted(words: string | undefined, field: "what" | "where"): string | undefined {
  if (words === undefined) return undefined;
  const trimmed = words.trim();
  const parsed = parseAutomationStudioAttemptAct({ id: "act.words", what: NO_CLASS_WORDS, where: WHERE_WORDS, classes: [], state: "landed", [field]: trimmed });
  return parsed.ok ? trimmed : undefined;
}
