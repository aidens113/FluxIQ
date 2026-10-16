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
    const { name, revision, written, keptOut, members } = entry as Record<string, unknown>;
    const rows = automationStudioResultKeptOutRowsOf(keptOut);
    if (typeof name !== "string" || typeof revision !== "number" || !Number.isSafeInteger(revision) || typeof written !== "string" || !rows?.length) return [];
    if (members === undefined) return [{ name, revision, written, keptOut: rows }];
    const set = membersOf(members);
    return set ? [{ name, revision, written, keptOut: rows, members: set }] : [];
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
    : `${capital(condition.name)}, as revision ${condition.revision} wrote it (${condition.written}), left out by itself only ${rowsSaid(condition.keptOut)}.`).join(" ");
  return `Core's record of this build's trials shows ${one ? "a condition" : "conditions"} leaving out only rows the request does not ask for, and this ${subject} no longer writes ${it} as ${one ? "it was" : "they were"} written. ${each} `
    + `Dropping or changing ${it} brings rows like those back. Keep ${it} as written, make the other changes you meant, and submit the whole ${subject} again. `
    + `If you mean to drop or change ${it} anyway, submit the same change again: Core refuses this once, not twice.`;
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
