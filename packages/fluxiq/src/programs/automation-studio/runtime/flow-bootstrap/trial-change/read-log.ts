// The latest reads one ledger has seen, kept for a trial's readings (t775 D1).
//
// A trial is judged against the state recorded just before it (user,
// 2026-10-27). Every read that reaches a ledger (`../site-reset/ledger.ts`,
// `observed`) is logged here with the ledger clock then: per page location the
// newest read, per list group the newest read that held it, and per control
// place the newest read that reported it. A place's latest read is the newer of
// its own and its location's: a newer read at that location that no longer
// holds the list says the list could not be read there now. `seq` orders every
// read, so a reader can tell whether a look it asked for landed. Opaque tokens
// only; nothing here reaches a model.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioSiteResetCollection } from "../reset-settlement/index.ts";
import type { AutomationStudioTrialLoggedRead, AutomationStudioTrialWitnessPlace } from "./contracts.ts";

/** What a read carries that the log keeps (site-reset's `AutomationStudioSiteResetRead`). */
type Read = { state: JsonObject; location?: string | undefined; lines?: { gone: string[]; added: string[] } | undefined; collections?: readonly AutomationStudioSiteResetCollection[] | undefined; controls?: Readonly<Record<string, Readonly<Record<string, number>>>> | undefined };

/** The bounded log (header): at most this many locations, groups and places each are kept, the oldest dropped first. */
const CAP = 500;

export class AutomationStudioTrialChangeReadLog {
  private count = 0;
  private readonly byLocation = new Map<string, AutomationStudioTrialLoggedRead>();
  private readonly byGroup = new Map<string, AutomationStudioTrialLoggedRead>();
  private readonly byPlace = new Map<string, AutomationStudioTrialLoggedRead>();

  /** How many reads were logged: a look landed when a place's latest read has a higher `seq` than this was before it. */
  get seq(): number { return this.count; }

  /** Logs one read at ledger `clock` (header). */
  observed(read: Read, clock: number): void {
    this.count += 1;
    const logged: AutomationStudioTrialLoggedRead = {
      state: structuredClone(read.state), clock, seq: this.count,
      ...(read.location ? { location: read.location } : {}),
      ...(read.lines ? { lines: { gone: [...read.lines.gone], added: [...read.lines.added] } } : {}),
      ...(read.collections ? { collections: read.collections.map((entry) => ({ scope: entry.scope, group: entry.group, subjects: [...entry.subjects], states: { ...entry.states } })) } : {}),
      ...(read.controls ? { controls: Object.fromEntries(Object.entries(read.controls).map(([place, counts]) => [place, { ...counts }])) } : {})
    };
    if (read.location) kept(this.byLocation, read.location, logged);
    for (const group of new Set((read.collections ?? []).map((entry) => entry.group))) kept(this.byGroup, group, logged);
    for (const place of Object.keys(read.controls ?? {})) kept(this.byPlace, place, logged);
  }

  /** The newest read of `place` (header), or none. */
  latest(place: AutomationStudioTrialWitnessPlace): AutomationStudioTrialLoggedRead | undefined {
    const own = place.kind === "list" ? this.byGroup.get(place.group) : this.byPlace.get(place.place);
    const there = place.location !== undefined ? this.byLocation.get(place.location) : undefined;
    // A control witness reads only a read that reported controls at all; one that did not never read it.
    const usable = there && (place.kind === "list" || there.controls !== undefined) ? there : undefined;
    if (!own) return usable;
    return usable && usable.seq > own.seq ? usable : own;
  }

  /** Where `place` was last read, where any read of it carried a location. */
  locationOf(place: AutomationStudioTrialWitnessPlace): string | undefined {
    return (place.kind === "list" ? this.byGroup.get(place.group) : this.byPlace.get(place.place))?.location;
  }
}

/** Sets `key` to `value` as the newest entry, dropping the oldest past the cap (header). */
function kept(map: Map<string, AutomationStudioTrialLoggedRead>, key: string, value: AutomationStudioTrialLoggedRead): void {
  map.delete(key);
  map.set(key, value);
  if (map.size > CAP) map.delete(map.keys().next().value!);
}
