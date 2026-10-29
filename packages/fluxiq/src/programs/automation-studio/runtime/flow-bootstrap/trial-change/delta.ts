// One witness's delta from the reading taken just before a trial to the one
// taken just after it (t775). Pure: nothing here reads a page.
//
// - **List.** Subjects are matched across every scope the group was read in (a
//   line moved to another page of the same list is the same line), each with
//   its row-value state tokens; a subject only after is added, only before is
//   removed, present on both sides with different states is changed. A reading
//   that carries no collection of the group did not read it: `unread`. A group
//   read with no subjects is an empty list, which is a reading.
// - **Control.** The place's counts per state token on each side, a missing
//   token counting 0. A reading that reports controls but not this place shows
//   none there (as `../reset-settlement/control-tracker.ts` reads a page); one
//   that reports no controls at all did not read it: `unread`.
// - **Direction (t787).** Given the counts the build recorded at the place
//   when it first read it (`start`), a changed control is `returned` when
//   every state token whose count changed ended at its count there (a token
//   the start lacks counting 0): the trial put the place back to how the
//   build found it, taking back what an earlier act had made. Tokens that did
//   not change are not compared, so a state the start read and the step's own
//   diff did not report says nothing either way. No start, no direction.

import type { AutomationStudioSiteResetCollection } from "../reset-settlement/index.ts";
import type { AutomationStudioTrialDelta, AutomationStudioTrialReading, AutomationStudioTrialWitness } from "./contracts.ts";

/** The delta of one witness from `before` to `after`; `unread` when either side carried no reading of it. `start`: a control place's counts at the build's start, for its direction (header). */
export function automationStudioTrialDelta(
  witness: AutomationStudioTrialWitness,
  before: AutomationStudioTrialReading | undefined,
  after: AutomationStudioTrialReading | undefined,
  start?: Readonly<Record<string, number>>
): AutomationStudioTrialDelta {
  if (witness.kind === "control") {
    const from = before ? placeCounts(before, witness.place) : undefined, to = after ? placeCounts(after, witness.place) : undefined;
    if (!from || !to) return { witness: witness.id, kind: "control", status: "unread" };
    if (sameCounts(from, to)) return { witness: witness.id, kind: "control", status: "unchanged", before: from, after: to };
    return { witness: witness.id, kind: "control", status: "changed", before: from, after: to, ...(start && returned(from, to, start) ? { returned: true as const } : {}) };
  }
  const from = before ? groupStates(before.collections, witness.group) : undefined, to = after ? groupStates(after.collections, witness.group) : undefined;
  if (!from || !to) return { witness: witness.id, kind: "list", status: "unread" };
  const added: string[] = [], removed: string[] = [], changed: string[] = [], unchanged: string[] = [];
  for (const [subject, states] of from) {
    const later = to.get(subject);
    if (later === undefined) removed.push(subject);
    else (later === states ? unchanged : changed).push(subject);
  }
  for (const subject of to.keys()) if (!from.has(subject)) added.push(subject);
  return { witness: witness.id, kind: "list", status: added.length + removed.length + changed.length ? "changed" : "unchanged", added: added.sort(), removed: removed.sort(), changed: changed.sort(), unchanged: unchanged.sort() };
}

/** Each subject of the group across its scopes, with its state tokens joined in a fixed order; undefined when no collection of the group was read. */
function groupStates(collections: readonly AutomationStudioSiteResetCollection[] | undefined, group: string): Map<string, string> | undefined {
  const own = (collections ?? []).filter((collection) => collection.group === group);
  if (!own.length) return undefined;
  const states = new Map<string, string[]>();
  for (const collection of own) for (const subject of collection.subjects) states.set(subject, [...(states.get(subject) ?? []), collection.states[subject] ?? ""]);
  return new Map([...states].map(([subject, tokens]) => [subject, JSON.stringify(tokens.sort())]));
}

/** The place's counts in one reading: none when the reading reports controls without the place, undefined when it reports no controls. */
function placeCounts(reading: AutomationStudioTrialReading, place: string): Record<string, number> | undefined {
  if (!reading.controls) return undefined;
  return { ...(Object.hasOwn(reading.controls, place) ? reading.controls[place] : {}) };
}

/** Every token whose count changed from `from` to `to` ended at its count in `start` (header); `from` and `to` differ. */
function returned(from: Readonly<Record<string, number>>, to: Readonly<Record<string, number>>, start: Readonly<Record<string, number>>): boolean {
  return [...new Set([...Object.keys(from), ...Object.keys(to)])].every((token) => (from[token] ?? 0) === (to[token] ?? 0) || (to[token] ?? 0) === (start[token] ?? 0));
}

function sameCounts(left: Readonly<Record<string, number>>, right: Readonly<Record<string, number>>): boolean {
  return [...new Set([...Object.keys(left), ...Object.keys(right)])].every((token) => (left[token] ?? 0) === (right[token] ?? 0));
}
