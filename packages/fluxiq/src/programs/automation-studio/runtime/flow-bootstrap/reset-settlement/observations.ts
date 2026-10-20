// What one ledger has seen of the site's complete lists (t719, F1, L1 reset
// settlement): the originals each act is judged against and the latest read of
// each list group, stamped with when it was read.
//
// - **Originals.** The first complete read of a list scope, kept with how many
//   acts the ledger had recorded when it landed (`beforeAct`): a list is an
//   original for an act only when it was read before that act. A read routed
//   with `baseline` false (another brief's resource) never makes one, and a
//   project's original evidence is adopted explicitly (`adopt`).
// - **Latest reads.** Per scope its subjects in order and their row values;
//   per group the scopes its latest read held, how many acts were recorded
//   then, the ledger clock then (`../site-reset/ledger.ts`: a read is fresh only when no
//   lasting call or trial landed after it), and where it was read. A malformed
//   group (`./collection-groups.ts`) is read as holding nothing, so no earlier
//   witness survives it.

import { automationStudioSiteResetInvalidCollectionGroups as invalidCollectionGroups, type AutomationStudioSiteResetCollection } from "./collection-groups.ts";

/** What a read carries that the observations keep: where it was read and its complete lists (site-reset's `AutomationStudioSiteResetRead`). */
type Read = { location?: string | undefined; collections?: readonly AutomationStudioSiteResetCollection[] | undefined };

/** A list scope's first complete read: how many acts preceded it, its group, subjects in order and their row values. */
export type AutomationStudioSiteResetOriginal = { beforeAct: number; subjects: ReadonlySet<string>; group: string; states: ReadonlyMap<string, string> };

export class AutomationStudioSiteResetObservations {
  readonly originals = new Map<string, AutomationStudioSiteResetOriginal>();
  /** Acts recorded when each group's latest complete read landed. */
  readonly groupObservedAfter = new Map<string, number>();
  /** The ledger clock when each group's latest read landed. */
  readonly groupClock = new Map<string, number>();
  readonly groupLocation = new Map<string, string>();
  readonly currentSubjects = new Map<string, ReadonlySet<string>>();
  readonly currentStates = new Map<string, ReadonlyMap<string, string>>();
  readonly currentGroups = new Map<string, string>();
  readonly latestGroupScopes = new Map<string, ReadonlySet<string>>();

  /** Original project evidence predates every lasting act; adoption never changes current observations. */
  adopt(collections: readonly AutomationStudioSiteResetCollection[]): void {
    const invalid = invalidCollectionGroups(collections);
    for (const collection of collections) {
      if (invalid.has(collection.group)) continue;
      if (!this.originals.has(collection.scope)) this.originals.set(collection.scope, { beforeAct: 0, subjects: new Set(collection.subjects), group: collection.group, states: new Map(Object.entries(collection.states)) });
    }
  }

  /** A passive whole-scope read after `acts` recorded acts, at ledger `clock`; answers the groups it read. */
  observe(read: Read, baseline: boolean, acts: number, clock: number): ReadonlySet<string> {
    const observed = new Map<string, Set<string>>();
    const collections = read.collections ?? [];
    const invalid = invalidCollectionGroups(collections);
    // Never shrink a malformed group into an apparently complete subset, or
    // reuse an earlier positive witness after an invalid fresh read.
    for (const group of invalid) observed.set(group, new Set());
    for (const collection of collections) {
      if (invalid.has(collection.group)) continue;
      const subjects = new Set(collection.subjects);
      if (baseline && !this.originals.has(collection.scope)) this.originals.set(collection.scope, { beforeAct: acts, subjects, group: collection.group, states: new Map(Object.entries(collection.states)) });
      this.currentSubjects.set(collection.scope, subjects);
      this.currentStates.set(collection.scope, new Map(Object.entries(collection.states)));
      this.currentGroups.set(collection.scope, collection.group);
      const scopes = observed.get(collection.group) ?? new Set<string>();
      scopes.add(collection.scope);
      observed.set(collection.group, scopes);
    }
    for (const [group, scopes] of observed) {
      this.latestGroupScopes.set(group, scopes);
      this.groupObservedAfter.set(group, acts);
      this.groupClock.set(group, clock);
      if (read.location) this.groupLocation.set(group, read.location);
    }
    return new Set(observed.keys());
  }

  /** One complete list restored in its original order, including every original row value. */
  restored(scope: string): boolean {
    const before = this.originals.get(scope), now = this.currentSubjects.get(scope), states = this.currentStates.get(scope);
    const ordered = [...(now ?? [])];
    return !!before && !!now && !!states && this.currentGroups.get(scope) === before.group && ordered.length === before.subjects.size && states.size === ordered.length && before.states.size === before.subjects.size && [...before.subjects].every((subject, index) => {
      const original = before.states.get(subject);
      return ordered[index] === subject && typeof original === "string" && original.length > 0 && states.get(subject) === original;
    });
  }
}
