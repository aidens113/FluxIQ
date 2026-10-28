// What one ledger has seen of the site's complete lists (t719, F1, L1 reset
// settlement): the originals each act is judged against and the latest read of
// each list group, stamped with when it was read.
//
// - **Originals.** The first complete read of a list scope, kept with how many
//   acts the ledger had recorded when it landed (`beforeAct`): a list is an
//   original for an act only when it was read before that act. A read routed
//   with `baseline` false (another brief's resource) never makes one, and a
//   project's original evidence is adopted explicitly (`adopt`). A group an
//   act of the build already counts among its witnesses (`touched`, decided by
//   the caller) makes none either: the seal is per group (t751 R1), so a list
//   first read after an unrelated act is still an original for later acts.
// - **Latest reads.** Per scope its subjects in order and their row values;
//   per group the scopes its latest read held, how many acts were recorded
//   then, the ledger clock then (`../site-reset/ledger.ts`: a read is fresh only when no
//   lasting call or trial landed after it), and where it was read. A malformed
//   group (`./collection-groups.ts`) is read as holding nothing, so no earlier
//   witness survives it.
// - **A list read in place after an undo is stale (t772 R1).** Many sites draw
//   a removal only on the list's next load, so a read in place just after an
//   undo landed can still show the removed row (rerun round 6
//   `run-mvrj7qg9-b6dc94f6`: three acts were called unsettleable on such a
//   read). A read loads its page when it is made at another location than the
//   read before it, or during Core's own look there (`loading`, `./judge.ts`
//   `lookFirst`). A read with no location is judged as read, as before: no one,
//   Core included, could open its page again, so holding it as in place would
//   leave its acts open for good. Per group this keeps how many undos had
//   landed on the acts it witnesses at its latest load (`loads`, counted by the
//   judge, which knows the acts); a group whose latest read came after more
//   landed undos than that was read in place after one, and is stale for
//   settlement and reach alike
//   (`readInPlace`): the one fact `./judge.ts` (`evaluate`, `lookFirst`) and
//   `../site-reset/undo-reach.ts` read, with no second copy.

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
  /** Where the latest read with a location was made, and where Core's own look is loading the page now (header). */
  private shownAt: string | undefined;
  private loadingAt: string | undefined;
  /** Groups the latest read loaded, not yet counted (`loads`). */
  private loadedNow: string[] = [];
  /** Per group, the undos landed on the acts it witnesses at its latest load (header). */
  private readonly loadedUndos = new Map<string, number>();

  /** Core's own look is loading `location` (header): a read there loads it, though the read before was there too. Undefined: the look is over. */
  loading(location: string | undefined): void {
    this.loadingAt = location;
  }

  /** Counts, for each group the latest read loaded, the undos landed on the acts it witnesses now (`undos`, the judge's); after every read (header). */
  loads(undos: (group: string) => number): void {
    for (const group of this.loadedNow) this.loadedUndos.set(group, undos(group));
    this.loadedNow = [];
  }

  /** Whether `group`'s latest read was made in place after an undo landed on an act it witnesses (`undos` landed now): stale for settlement and reach (header). */
  readInPlace(group: string, undos: number): boolean {
    return undos > (this.loadedUndos.get(group) ?? 0);
  }

  /** Original project evidence predates every lasting act; adoption never changes current observations. */
  adopt(collections: readonly AutomationStudioSiteResetCollection[]): void {
    const invalid = invalidCollectionGroups(collections);
    for (const collection of collections) {
      if (invalid.has(collection.group)) continue;
      if (!this.originals.has(collection.scope)) this.originals.set(collection.scope, { beforeAct: 0, subjects: new Set(collection.subjects), group: collection.group, states: new Map(Object.entries(collection.states)) });
    }
  }

  /** A passive whole-scope read after `acts` recorded acts, at ledger `clock`; answers the groups it read. No original is kept for a `touched` group (header); by default none is. */
  observe(read: Read, baseline: boolean, acts: number, clock: number, touched: (group: string) => boolean = () => false): ReadonlySet<string> {
    const observed = new Map<string, Set<string>>();
    const collections = read.collections ?? [];
    const invalid = invalidCollectionGroups(collections);
    // Never shrink a malformed group into an apparently complete subset, or
    // reuse an earlier positive witness after an invalid fresh read.
    for (const group of invalid) observed.set(group, new Set());
    for (const collection of collections) {
      if (invalid.has(collection.group)) continue;
      const subjects = new Set(collection.subjects);
      if (baseline && !this.originals.has(collection.scope) && !touched(collection.group)) this.originals.set(collection.scope, { beforeAct: acts, subjects, group: collection.group, states: new Map(Object.entries(collection.states)) });
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
    // A read at another location than the one before it, or during Core's look there, loaded its page (header). A read
    // with no location is judged as read (header), and leaves the page taken to be where it was.
    const load = read.location === undefined || read.location !== this.shownAt || read.location === this.loadingAt;
    this.loadedNow = load ? [...observed.keys()] : [];
    if (read.location !== undefined) this.shownAt = read.location;
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
