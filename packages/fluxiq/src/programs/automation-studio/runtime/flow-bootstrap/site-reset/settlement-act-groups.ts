// Every complete list group one act could change, each judged against the
// latest reads (L1 reset settlement, `./ledger.ts`).
//
// An act's named scopes are its destinations -- named on its own call, on a
// look under `undoes`, admitted against, or lent by the explored acts a trial
// act repeats -- the two lists of a witnessed transfer, the list its subject
// undo was proved on, and its own list: the complete original its control sat
// in, read before it. What it was about is its `subject`, and its `page` where
// it sat in no item. Each group they fall in is one witness
// (`./settlement-group-witness.ts`), told by the ref and location of the list
// it names, for the words an open act is answered with. Pure.

import type { AutomationStudioSiteResetSpot } from "./contracts.ts";
import { automationStudioSiteResetGroupWitness as groupWitness, type AutomationStudioSiteResetGroupStanding } from "./settlement-group-witness.ts";
import type { AutomationStudioSiteResetObservations } from "./settlement-observations.ts";

type Scope = { scope: string; group: string };

export function automationStudioSiteResetActGroups(input: {
  act: { spot?: AutomationStudioSiteResetSpot | undefined; destinations: readonly Scope[]; transfer?: { origin: string; scope: string; group: string } | undefined; subjectUndo?: Scope | undefined };
  /** The act's 1-based place among its ledger's acts, the ledger clock it landed at, and the ledger clock now. */
  sequence: number;
  since: number;
  clock: number;
  observations: AutomationStudioSiteResetObservations;
  /** A list scope's issued ref and where it was read, if it is an original. */
  described(scope: string): { ref: string; location?: string } | undefined;
}): Array<AutomationStudioSiteResetGroupStanding & { ref?: string; location?: string }> {
  const { act, observations } = input;
  const spot = act.spot ?? {};
  const named: Scope[] = [...act.destinations];
  if (act.transfer) named.push({ scope: act.transfer.origin, group: act.transfer.group }, { scope: act.transfer.scope, group: act.transfer.group });
  if (act.subjectUndo) named.push({ scope: act.subjectUndo.scope, group: act.subjectUndo.group });
  const own = spot.scope === undefined ? undefined : observations.originals.get(spot.scope);
  if (spot.scope !== undefined && own && own.beforeAct < input.sequence) named.push({ scope: spot.scope, group: own.group });
  const subjects = [spot.subject, ...(spot.item === undefined ? [spot.page] : [])].filter((subject): subject is string => subject !== undefined);
  return [...new Set(named.map((entry) => entry.group))].map((group) => {
    const scopes = [...new Set(named.filter((entry) => entry.group === group).map((entry) => entry.scope))];
    const standing = groupWitness({ observations, group, scopes, subjects, sequence: input.sequence, since: input.since, clock: input.clock });
    const described = [...scopes, ...standing.scopes].map((scope) => input.described(scope)).find((entry) => entry !== undefined);
    const location = observations.groupLocation.get(group) ?? described?.location;
    return { ...standing, ...(described ? { ref: described.ref } : {}), ...(location ? { location } : {}) };
  });
}
