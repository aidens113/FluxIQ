// A submission that drops or changes a condition Core's record showed leaves
// out only rows the request does not ask for (t641, `./kept-conditions.ts`).
//
// The submission controller asks the trial gate for the result it kept of the
// latest trial (`keptConditions`), and reads here which of those conditions the
// submitted plan no longer writes as it was written (`./written-conditions.ts`):
// removed, loosened, tightened or otherwise reworded -- Core does not weigh the
// change, it says only what it measured: what the condition kept out, by its
// own record. The controller refuses such a submission once per condition; a
// second submission of the same drop is the model's considered choice, and is
// accepted. A refusal is a hint the model can override, never a block. Core's
// words name the condition as the trial's lines named it, as the revision
// wrote it, and each row it kept out with how Core's record accounts for it.
// Generic words, naming no site or task.
//
// **A set kept as one (t666, `./kept-conditions.ts`, `members`)** is dropped
// only where the plan writes none of its conditions as written: each left its
// rows out only beside the others, so any one kept as written keeps them out.
// Refused once, as one condition is, and said as the conditions that left
// those rows out together.
//
// **A condition kept by the request's own exclusion words (t687,
// `./kept-conditions.ts`, `excludes`)** is refused once the same way, and said
// by those words: that Core read them on rows it left out, and none it read
// that the request does not say to leave out, with any rows it alone left out
// that Core accounts for. It may carry no such row.

import { automationStudioResultKeptOutRowsOf } from "./record-shape.ts";
import type { AutomationStudioResultKeptCondition, AutomationStudioResultKeptConditionDrop, AutomationStudioResultStandingNoKeptOutRow } from "./types.ts";
import { automationStudioResultWrittenConditions, type AutomationStudioResultConditionPlan } from "./written-conditions.ts";

/**
 * The kept conditions `carried` holds (any value a gate's kept result had;
 * one not of the shape is none) that `plan` no longer writes, less those in
 * `refused`, which a submission was already refused for; nothing where none.
 * `subject` is what the loop calls what it submits ("Flow", "subflow").
 */
export function automationStudioResultKeptConditionsDropped(input: {
  carried: unknown;
  plan: AutomationStudioResultConditionPlan | undefined;
  refused?: ReadonlySet<string> | undefined;
  subject?: string | undefined;
}): AutomationStudioResultKeptConditionDrop | undefined {
  const kept = keptOf(input.carried);
  if (!kept.length || !input.plan) return undefined;
  const written = automationStudioResultWrittenConditions(input.plan);
  const stillWritten = (condition: AutomationStudioResultKeptCondition): boolean => condition.members ? condition.members.some((member) => written.has(member.written)) : written.has(condition.written);
  const dropped = kept.filter((condition) => !stillWritten(condition) && !input.refused?.has(condition.written));
  return dropped.length ? { dropped, said: said(dropped, input.subject ?? "Flow") } : undefined;
}

/** The kept conditions a carried value holds, each of the shape (`./types.ts`); none otherwise. */
function keptOf(value: unknown): AutomationStudioResultKeptCondition[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): AutomationStudioResultKeptCondition[] => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const { name, revision, written, keptOut, members, excludes } = entry as Record<string, unknown>;
    const rows = automationStudioResultKeptOutRowsOf(keptOut);
    // Kept by the request's own exclusion words, it may carry no row (t687).
    const words = Array.isArray(excludes) && excludes.length > 0 && excludes.every((word) => typeof word === "string") ? { excludes: [...excludes as string[]] } : undefined;
    if (excludes !== undefined && !words) return [];
    if (typeof name !== "string" || typeof revision !== "number" || !Number.isSafeInteger(revision) || typeof written !== "string" || !rows || (!rows.length && !words)) return [];
    if (members === undefined) return [{ name, revision, written, keptOut: rows, ...words }];
    const set = membersOf(members);
    return set && rows.length ? [{ name, revision, written, keptOut: rows, members: set }] : [];
  });
}

/** The conditions of a set kept as one, two or more, each named and written; nothing where it is not of the shape. */
function membersOf(value: unknown): Array<{ name: string; written: string }> | undefined {
  if (!Array.isArray(value) || value.length < 2) return undefined;
  const members = value.map((member) => {
    if (!member || typeof member !== "object" || Array.isArray(member)) return undefined;
    const { name, written } = member as Record<string, unknown>;
    return typeof name === "string" && typeof written === "string" ? { name, written } : undefined;
  });
  return members.every((member) => member !== undefined) ? members as Array<{ name: string; written: string }> : undefined;
}

/** Core's words (header): each condition and what it kept out, then the way on. */
function said(dropped: readonly AutomationStudioResultKeptCondition[], subject: string): string {
  const one = dropped.length === 1 && !dropped[0]!.members;
  const it = one ? "it" : "them";
  const each = dropped.map((condition) => condition.members
    ? `${capital(condition.name)}, as revision ${condition.revision} wrote them (${condition.members.map((member) => member.written).join(" and ")}), left out together only ${rowsSaid(condition.keptOut)}; no one of them left ${condition.keptOut.length === 1 ? "it" : "them"} out by itself, so keeping any one of them as written keeps ${condition.keptOut.length === 1 ? "it" : "them"} out.`
    : condition.excludes?.length
      ? excludesSaid(condition)
      : `${capital(condition.name)}, as revision ${condition.revision} wrote it (${condition.written}), left out by itself only ${rowsSaid(condition.keptOut)}.`).join(" ");
  const byWords = dropped.filter((condition) => condition.excludes?.length).length;
  // A condition kept by the request's own exclusion words is said as one (t687); every other drop reads as it did.
  const shows = byWords === 0
    ? `${one ? "a condition" : "conditions"} leaving out only rows the request does not ask for`
    : byWords === dropped.length
      ? `${one ? "a condition" : "conditions"} leaving out rows by what the request itself says to leave out`
      : "conditions leaving out rows by what the request itself says to leave out, or only rows it does not ask for";
  const back = byWords === 0 ? "rows like those back" : "back rows the request says to leave out";
  return `Core's record of this build's trials shows ${shows}, and this ${subject} no longer writes ${it} as ${one ? "it was" : "they were"} written. ${each} `
    + `Dropping or changing ${it} brings ${back}. Keep ${it} as written, make the other changes you meant, and submit the whole ${subject} again. `
    + `If you mean to drop or change ${it} anyway, submit the same change again: Core refuses this once, not twice.`;
}

/**
 * A condition kept by the request's own exclusion words (t687): the request's
 * words, that Core read them on rows it left out, and the rows it left out by
 * itself that Core accounts for, where any.
 */
function excludesSaid(condition: AutomationStudioResultKeptCondition): string {
  const words = (condition.excludes ?? []).map((word) => JSON.stringify(word)).join(", ");
  const rows = condition.keptOut.length ? ` By itself it left out ${rowsSaid(condition.keptOut)}.` : "";
  return `${capital(condition.name)}, as revision ${condition.revision} wrote it (${condition.written}), leaves out rows by what the request itself says to leave out (${words}): Core read what those words name on rows it left out, and on none of them a value the request does not say to leave out.${rows}`;
}

/** The rows a condition kept out, each with how Core's record accounts for it. */
function rowsSaid(rows: readonly AutomationStudioResultStandingNoKeptOutRow[]): string {
  const parts = rows.map((row) => row.by === "also_in_result"
    ? `${JSON.stringify(row.label)} (another copy of it is in the result)`
    : `${JSON.stringify(row.label)} (Core read a value on it that fails the request's words ${(row.texts ?? []).map((text) => JSON.stringify(text)).join(", ")})`);
  return `${rows.length === 1 ? "this row" : `these ${rows.length} rows`}: ${parts.join("; ")}`;
}

function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
