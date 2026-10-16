// What a narrowing step chose and left out, from the page's own option groups
// (t655).
//
// **Why.** A8 frozen pair 5 towels (`run-mva6mlo8-f519063c`): a step chose one
// option of a named group before a list read. The rows the other options held
// never reached the read (`./narrowed-before.ts`), and nothing said what those
// options were or how many rows each held, so a judge could only guess whether
// the choice kept less than the request asks.
//
// **What is read, and only that.** The domain's state snapshot summary carries,
// beside its view, `groups` -- each named set of options the page showed, with
// each option's words, the count the page showed beside it, and whether it is
// chosen -- and `resultCount`, the number of results the page stated. These are
// words and numbers the domain read off the page; Core interprets none of
// them, and reads no line of the view. The step's group is the one with an
// option chosen after it that was shown unchosen before it, where exactly one
// such option exists; else the one group whose option's words are the step's
// control words, less a count in parentheses. Its other options are those
// still unchosen after the step, each with the count the page showed before
// it. A step that matches no group, or several, carries none.
//
// **And whether it only added a choice (t659).** A8 frozen pair 6 candidate
// towels `run-mvac1av6-f7b0f9e2`: two nos blamed a step after which the page
// stated as many results as before it, and Core could not say the step removed
// no row, because a switch from one option to another (or a sort) can state the
// same count with other rows. So `addedChoice` is true only where the option
// was found by its flip -- exactly one option chosen after the step that was
// shown unchosen before it -- its group showed no option chosen before the step,
// and exactly one after it. A choice added to an empty group narrows the page
// to rows it showed before; then as many after as before are the same rows
// (`./refuted-no/unseen-row-claim.ts`). Never inferred from a control's words.
//
// **Screened as a control's words are** (`./narrowed-before.ts`): with no
// denied-keys declaration, or where the group's or any option's words carry a
// denied key or a credential shape, the group is left unsaid and `withheld`
// set. The result counts are numbers and always said.

import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import { screenAutomationStudioLlmEvidence } from "../llm/index.ts";
import type { AutomationStudioResultNarrowingStep } from "./contracts/index.ts";

/** One option group as a snapshot summary carries it. */
type Group = { name: string; options: Array<{ words: string; count?: number; chosen: boolean }> };

/** The parts of a narrowing step the page's groups say (header). */
export type AutomationStudioResultNarrowingGroup = Pick<AutomationStudioResultNarrowingStep, "group" | "chose" | "leftOptions" | "resultCount" | "addedChoice">;

/** A count in parentheses ending a control's words, as the page prints it beside an option. */
const TRAILING_COUNT = /\s*\(\d{1,3}(?:,\d{3})+\)$|\s*\(\d+\)$/u;

/** What the step's snapshots say it chose and left out (header), and whether any of it was withheld. */
export function automationStudioResultNarrowingGroup(input: {
  control: string | undefined;
  before: JsonValue | undefined;
  after: JsonValue | undefined;
  deniedEvidenceKeys: readonly string[] | undefined;
}): { said: AutomationStudioResultNarrowingGroup; withheld: boolean } {
  const before = groupsOf(input.before);
  const after = groupsOf(input.after);
  const resultCount = counts(input.before, input.after);
  const said: AutomationStudioResultNarrowingGroup = resultCount ? { resultCount } : {};
  const flip = flipped(before, after);
  const chosen = flip ?? byControl(input.control, after.length ? after : before);
  if (!chosen) return { said, withheld: false };
  const shown = before.find((group) => group.name === chosen.group) ?? after.find((group) => group.name === chosen.group)!;
  const now = (after.length ? after : before).find((group) => group.name === chosen.group);
  const stillUnchosen = (words: string): boolean => !(now?.options.find((option) => option.words === words)?.chosen ?? false);
  const leftOptions = shown.options.filter((option) => option.words !== chosen.words && stillUnchosen(option.words))
    .map((option) => ({ words: option.words, ...(option.count !== undefined ? { count: option.count } : {}) }));
  const words = [chosen.group, chosen.words, ...leftOptions.map((option) => option.words)];
  if (input.deniedEvidenceKeys === undefined || words.some((text) => sayable(text, input.deniedEvidenceKeys!) === false)) return { said, withheld: true };
  const added = flip !== undefined && onlyAdded(before, after, flip.group);
  return { said: { group: chosen.group, chose: chosen.words, leftOptions, ...(added ? { addedChoice: true } : {}), ...said }, withheld: false };
}

/** Whether the group showed no option chosen before the step and exactly one after it (header, t659). */
function onlyAdded(before: readonly Group[], after: readonly Group[], name: string): boolean {
  const was = before.find((group) => group.name === name);
  const now = after.find((group) => group.name === name);
  return was !== undefined && now !== undefined && !was.options.some((option) => option.chosen) && now.options.filter((option) => option.chosen).length === 1;
}

/** The one option chosen after the step that was shown unchosen before it; nothing for none or several. */
function flipped(before: readonly Group[], after: readonly Group[]): { group: string; words: string } | undefined {
  const found = after.flatMap((group) => group.options.filter((option) => option.chosen
    && before.find((was) => was.name === group.name)?.options.some((earlier) => earlier.words === option.words && !earlier.chosen) === true)
    .map((option) => ({ group: group.name, words: option.words })));
  return found.length === 1 ? found[0] : undefined;
}

/** The one option whose words are the step's control words, less a trailing count; nothing for none or several. */
function byControl(control: string | undefined, groups: readonly Group[]): { group: string; words: string } | undefined {
  const wanted = control === undefined ? "" : fold(control.replace(TRAILING_COUNT, ""));
  if (!wanted) return undefined;
  const found = groups.flatMap((group) => group.options.filter((option) => fold(option.words) === wanted).map((option) => ({ group: group.name, words: option.words })));
  return found.length === 1 ? found[0] : undefined;
}

/** The result counts the two snapshots state, where either does. */
function counts(before: JsonValue | undefined, after: JsonValue | undefined): AutomationStudioResultNarrowingGroup["resultCount"] {
  const was = count(isRecord(before) ? before.resultCount : undefined);
  const now = count(isRecord(after) ? after.resultCount : undefined);
  if (was === undefined && now === undefined) return undefined;
  return { ...(was !== undefined ? { before: was } : {}), ...(now !== undefined ? { after: now } : {}) };
}

/** A snapshot summary's groups, each held to its shape; a malformed one is left out, as is any summary that carries none. */
function groupsOf(summary: JsonValue | undefined): Group[] {
  const groups = isRecord(summary) && Array.isArray(summary.groups) ? summary.groups : [];
  return groups.flatMap((group): Group[] => {
    if (!isRecord(group) || typeof group.name !== "string" || !group.name.trim() || !Array.isArray(group.options)) return [];
    const options = group.options.flatMap((option): Group["options"] => {
      if (!isRecord(option) || typeof option.words !== "string" || !option.words.trim() || typeof option.chosen !== "boolean") return [];
      const given = count(option.count);
      return [{ words: option.words, ...(given !== undefined ? { count: given } : {}), chosen: option.chosen }];
    });
    return options.length === group.options.length ? [{ name: group.name, options }] : [];
  });
}

/** Whether words may be said: no denied key and no credential shape. */
function sayable(text: string, deniedKeys: readonly string[]): boolean {
  const found = screenAutomationStudioLlmEvidence(text, deniedKeys);
  return !found.deniedKey && !found.secretShaped;
}

function fold(text: string): string {
  return text.toLowerCase().replace(/\s+/gu, " ").trim();
}

function count(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
