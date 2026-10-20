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
// Pure: it reads the ledger's observations and decides nothing else.

import type { AutomationStudioSiteResetObservations } from "./settlement-observations.ts";

/**
 * One group witness as last read: `none` (no baselined relevant scope),
 * `stale`, `incomplete`, `differs` or `holds`; `changed` when the latest read
 * after the act, fresh or not, showed it differing (a change was seen).
 */
export type AutomationStudioSiteResetGroupStanding = { status: "none" | "stale" | "incomplete" | "differs" | "holds"; scopes: string[]; changed: boolean };

export function automationStudioSiteResetGroupWitness(input: {
  observations: Pick<AutomationStudioSiteResetObservations, "originals" | "groupClock" | "latestGroupScopes" | "currentSubjects" | "currentStates" | "restored">;
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
  if ([...relevant].some((scope) => !seen.restored(scope))) return "differs";
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
