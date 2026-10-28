// What the build has seen of the site's shown values (t772 value witness): the
// evidence a value act's witness (`./value-witness.ts`) is judged on, as the
// control tracker is for a toggle (`./control-tracker.ts`), and by the same
// rules of start and freshness.
//
// - **Per page.** Every read that names its page (`scope`) replaces what is
//   known of that page's values; a read reporting none shows none.
// - **Build start, per place.** The value a place showed the first time a read
//   reported it while no act of the build was recorded replacing it. An act
//   read around by Core (an exploration call: `../site-reset/act-places.ts`)
//   finds its places already started by the read just before it; a trial
//   step's act, read only by its own diff, starts a place with no start at its
//   `from` (`landed`). Either way the place is the build's from then on, and no
//   later read seeds it: a read after the act would seed the act's own value.
// - **Standing.** A value act holds when the latest read of its page, taken
//   after it and at the ledger's current clock, shows the build's start value
//   at one of its started places, and none of its `newValue` places still shows
//   the value the act set (unless that value is the start). `stale` when that
//   read is older or there is none; `unproven` when none of its places has a
//   start (no call can settle it: `./judge.ts`, `no_baseline`); `open`
//   otherwise. A replacement without `newValue` -- an
//   option's label showed the new value, or a place only shifted -- never keeps
//   an act open, and one place back at its start is enough, so a line that
//   changes by itself (a "saved at" time) neither holds nor blocks. Opaque
//   tokens only.

import type { AutomationStudioSiteResetToggleStanding } from "./control-tracker.ts";
import type { AutomationStudioSiteResetValueReplacement } from "./value-witness.ts";

/** One act's value witness: the page it replaced values on, where that page is, and what it replaced there. */
export type AutomationStudioSiteResetValueWitness = { page: string; location?: string; replaced: readonly AutomationStudioSiteResetValueReplacement[] };

/** One page's latest read of values, and the ledger clock it was taken at. */
type PageRead = { values: ReadonlyMap<string, string>; clock: number; location?: string };

export class AutomationStudioSiteResetValueTracker {
  private readonly pages = new Map<string, PageRead>();
  private readonly starts = new Map<string, string>();
  /** Every place an act of the build replaced (header): no later read seeds its start. */
  private readonly touched = new Set<string>();
  private readonly locations = new Map<string, string>();

  /** A read of a page at `clock` (header); a read naming no page says nothing of values. */
  read(read: { scope?: string | undefined; location?: string | undefined; values?: Readonly<Record<string, string>> | undefined }, clock: number): void {
    if (read.scope === undefined) return;
    if (read.location) this.locations.set(read.scope, read.location);
    const values = new Map(Object.entries(read.values ?? {}));
    for (const [place, value] of values) if (!this.starts.has(place) && !this.touched.has(place)) this.starts.set(place, value);
    this.pages.set(read.scope, { values, clock, ...(read.location ? { location: read.location } : {}) });
  }

  /** An act Core read around replaced these values: its places are the build's from now on (header). */
  witnessed(witness: AutomationStudioSiteResetValueWitness): void {
    if (witness.location) this.locations.set(witness.page, witness.location);
    for (const replacement of witness.replaced) this.touched.add(replacement.place);
  }

  /** A trial step's act replaced these values, read off its own diff: a place with no start and no earlier act starts at its `from` (header). */
  landed(witness: AutomationStudioSiteResetValueWitness): void {
    if (witness.location) this.locations.set(witness.page, witness.location);
    for (const { place, from } of witness.replaced) {
      if (!this.starts.has(place) && !this.touched.has(place)) this.starts.set(place, from);
      this.touched.add(place);
    }
  }

  /** Whether `witness`, of an act that landed at `since`, is back at the build's start (header), judged against the ledger's `clock`. */
  standing(witness: AutomationStudioSiteResetValueWitness, since: number, clock: number): AutomationStudioSiteResetToggleStanding {
    const latest = this.pages.get(witness.page);
    const location = latest?.location ?? witness.location ?? this.locations.get(witness.page);
    const where = location ? { location } : {};
    const started = witness.replaced.filter((replacement) => this.starts.has(replacement.place));
    if (!started.length) return { status: "unproven", ...where };
    if (!latest || latest.clock < since || latest.clock < clock) return { status: "stale", ...where };
    const shows = (place: string) => latest.values.get(place);
    const still = witness.replaced.some((replacement) => replacement.newValue === true && shows(replacement.place) === replacement.to && replacement.to !== this.starts.get(replacement.place));
    const back = started.some((replacement) => shows(replacement.place) === this.starts.get(replacement.place));
    return { status: back && !still ? "holds" : "open", ...where };
  }
}
