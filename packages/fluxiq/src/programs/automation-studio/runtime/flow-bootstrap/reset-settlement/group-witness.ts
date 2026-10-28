// Whether a complete list group an act could change is as the build found it
// (L1 reset settlement; replaces F1's `destination-unchanged.ts` and the
// ledger's whole-group restoration proof).
//
// An act's group witness covers its relevant scopes in one group: the scopes
// named for it (its own list, its destinations) and every original scope of
// the group that held one of its subjects before it. It holds when the group's
// latest read is fresh -- after the act and after the latest lasting call or
// trial -- holds every relevant scope restored row for row and value for
// value, and no other scope of that read holds one of the act's subjects that
// it did not hold originally with the same value. Lists on the same page that
// are about nothing the act touched (recently viewed, menus) do not block it:
// F1 required the whole group, so unrelated lists kept acts open. A relevant
// scope missing from the latest read, or a malformed read, is `incomplete`;
// never settled. A group with no baselined relevant scope is no witness.
//
// **One act on a shared list settles by its own subjects (t772 w10).** Several
// lasting acts can each add their own subject to one list read before them. Once
// some are undone, a fresh load shows their subjects back while the others'
// still show, and row for row the list is not yet its original, so the undone
// acts stayed open and were reported left though they were put back (headed
// job-undo-redraws-on-load). A relevant scope that is not restored still holds
// for this act when, leaving out every subject whose difference is attributable
// to another act (`others`: the caller's acts still left on the site that
// witness this group, each recorded after the scope's original was read, by
// their own subjects, never one of this act's), the scope is its original row
// for row and value for value. So this act's own subjects must be exactly as
// found, and any difference no other act explains -- a row nobody added, a row
// the original held gone or changed, an order no act's subject accounts for --
// keeps it `differs` as before. The caller hands `others` only on a read that is
// not stale in place (`./observations.ts`, `readInPlace`), and an act with no
// subject of its own is judged on the whole scope, as before.
// Pure: it reads the ledger's observations and decides nothing else.

import type { AutomationStudioSiteResetObservations } from "./observations.ts";

/**
 * One group witness as last read: `none` (no baselined relevant scope),
 * `stale`, `incomplete`, `differs` or `holds`; `changed` when the latest read
 * after the act, fresh or not, showed it differing (a change was seen).
 */
export type AutomationStudioSiteResetGroupStanding = { status: "none" | "stale" | "incomplete" | "differs" | "holds"; scopes: string[]; changed: boolean };

/** Another act still left on the site that witnesses the same group: its 1-based place among its ledger's acts and its own subjects (header, t772 w10). */
export type AutomationStudioSiteResetOtherAct = { sequence: number; subjects: readonly string[] };

export function automationStudioSiteResetGroupWitness(input: {
  observations: Pick<AutomationStudioSiteResetObservations, "originals" | "groupClock" | "latestGroupScopes" | "currentSubjects" | "currentStates" | "currentGroups" | "restored">;
  group: string;
  /** Scopes named for the act in this group: its own list, its destinations. */
  scopes: readonly string[];
  /** What the act was about. */
  subjects: readonly string[];
  /** The act's 1-based place among its ledger's acts: an original counts only when read before it. */
  sequence: number;
  /** The ledger clock the act landed at, and the ledger clock now. */
  since: number;
  clock: number;
  /** The other acts a difference on this group may be attributable to, by their place and their own subjects (header, t772 w10); absent, every relevant scope must be restored whole. */
  others?: ReadonlyArray<AutomationStudioSiteResetOtherAct> | undefined;
}): AutomationStudioSiteResetGroupStanding {
  const { observations: seen, group, subjects } = input;
  const originals = [...seen.originals].filter(([, original]) => original.group === group && original.beforeAct < input.sequence);
  const relevant = new Set(input.scopes.filter((scope) => originals.some(([original]) => original === scope)));
  for (const [scope, original] of originals) if (subjects.some((subject) => original.subjects.has(subject))) relevant.add(scope);
  const scopes = [...relevant];
  if (!scopes.length) return { status: "none", scopes, changed: false };
  const stamp = seen.groupClock.get(group);
  // Only a read after the act says anything of it; a read before is never its restoration.
  if (stamp === undefined || stamp < input.since) return { status: "stale", scopes, changed: false };
  const compared = compare(input, relevant);
  const changed = compared === "differs";
  return stamp < input.clock ? { status: "stale", scopes, changed } : { status: compared, scopes, changed };
}

/** The group's latest read against the originals of its relevant scopes (header). */
function compare(input: Parameters<typeof automationStudioSiteResetGroupWitness>[0], relevant: ReadonlySet<string>): "incomplete" | "differs" | "holds" {
  const { observations: seen, subjects } = input;
  const latest = seen.latestGroupScopes.get(input.group) ?? new Set<string>();
  if ([...relevant].some((scope) => !latest.has(scope))) return "incomplete";
  if ([...relevant].some((scope) => !seen.restored(scope) && !backButOthers(input, scope))) return "differs";
  for (const scope of latest) {
    if (relevant.has(scope)) continue;
    const original = seen.originals.get(scope);
    const now = seen.currentSubjects.get(scope);
    for (const subject of subjects) {
      if (!now?.has(subject)) continue;
      const same = !!original && original.beforeAct < input.sequence && original.subjects.has(subject) && original.states.get(subject) === seen.currentStates.get(scope)?.get(subject);
      if (!same) return "differs";
    }
  }
  return "holds";
}

/**
 * Whether `scope`, leaving out the subjects whose difference another act explains (header, t772 w10), is its original row
 * for row and value for value; never for an act with no subject of its own or with no other act to explain anything.
 */
function backButOthers(input: Parameters<typeof automationStudioSiteResetGroupWitness>[0], scope: string): boolean {
  const { observations: seen, subjects, others } = input;
  const original = seen.originals.get(scope), states = seen.currentStates.get(scope);
  if (!subjects.length || !others?.length || !original || !states || seen.currentGroups.get(scope) !== original.group || original.states.size !== original.subjects.size) return false;
  const explained = (subject: string): boolean => !subjects.includes(subject) && others.some((other) => other.sequence > original.beforeAct && other.subjects.includes(subject));
  const before = [...original.subjects].filter((subject) => !explained(subject));
  const now = [...(seen.currentSubjects.get(scope) ?? [])].filter((subject) => !explained(subject));
  return now.length === before.length && before.every((subject, index) => {
    const value = original.states.get(subject);
    return now[index] === subject && typeof value === "string" && value.length > 0 && states.get(subject) === value;
  });
}
