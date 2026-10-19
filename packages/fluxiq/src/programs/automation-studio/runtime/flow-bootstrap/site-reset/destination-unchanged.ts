// Whether an act's destination shows no change from it (F1, 2026-10-19).
//
// Office checkout r1 (`run-mved5pro-91998cc2`) created something admitted
// against an observed destination that no list shows and no control closes;
// job save r1 (`run-mvectfld-c2f5d958`) pressed a save twice from places with
// no list of their own, and the site itself failed both. In each, complete
// reads of where the act lands, taken after it, showed that destination exactly
// as first observed, yet no rule used that evidence, and no trial could run.
//
// An act's destination is the group it was admitted against, or else the group
// of the list its control sat in, or else, for a control in no list, every
// group read complete before it. It shows no change when each of those groups
// was read before the act, was read again after it, and that fresh read holds
// exactly its original scopes, each restored row for row and value for value;
// and at least one of them held none of what the act was about, so it is a
// place the act's effect would have shown. Anything never read before the act,
// unread since, partial, malformed or changed answers no. This proves no undo:
// the ledger (`./ledger.ts`) lists the act as left with no change seen.

/** Whether every destination group of an act was read complete after it and is exactly as first observed. */
export function automationStudioSiteResetDestinationUnchanged(input: {
  /** The act's 1-based place among its ledger's acts: a read counts only once this many acts were recorded. */
  sequence: number;
  /** The groups it was admitted against or sits in; absent, every group with an original read before it. */
  groups?: readonly string[];
  /** What the act was about; at least one destination group must have held none of it. */
  subjects: readonly string[];
  /** Each scope's first complete read, and how many acts were recorded before it. */
  originals: ReadonlyMap<string, { beforeAct: number; group: string; subjects: ReadonlySet<string> }>;
  /** How many acts were recorded when each group's latest complete read landed. */
  observedAfter: ReadonlyMap<string, number>;
  /** The scopes each group's latest read held. */
  fresh: ReadonlyMap<string, ReadonlySet<string>>;
  /** Whether a scope's latest read restores its original rows, order and values. */
  restored(scope: string): boolean;
}): boolean {
  const before = [...input.originals].filter(([, entry]) => entry.beforeAct < input.sequence);
  const groups = [...new Set(input.groups ?? before.map(([, entry]) => entry.group))];
  let lacking = false;
  for (const group of groups) {
    const original = before.filter(([, entry]) => entry.group === group);
    const fresh = input.fresh.get(group);
    if (!original.length || !fresh || (input.observedAfter.get(group) ?? -1) < input.sequence) return false;
    if (fresh.size !== original.length || !original.every(([scope]) => fresh.has(scope) && input.restored(scope))) return false;
    if (input.subjects.every((subject) => original.every(([, entry]) => !entry.subjects.has(subject)))) lacking = true;
  }
  return lacking;
}
