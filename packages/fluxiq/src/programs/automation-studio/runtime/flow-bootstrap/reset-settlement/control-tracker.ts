// What the build has seen of the site's stateful controls (L1 reset
// settlement): the evidence a toggle's witness is judged on
// (`./toggle-witness.ts`, `../site-reset/ledger.ts`).
//
// - **Per page.** Every read that names its page (`scope`) and reports its
//   controls replaces what is known of that page: a place a later read of it
//   does not report has no such control there now, so it counts as empty.
// - **Build start, per place.** The counts a place showed the first time any
//   read reported it. A place is a slot the domain names independently of the
//   page it is read on (a post's like shares its place in a dialog and on the
//   post's own page), so its start is one per place.
// - **Presses.** A landed press at a place is pending until the next read of
//   the page it was pressed on, which fills its counts after it; its counts
//   before it are the latest read of that page. The last filled press per
//   place is kept with the ledger clock it landed at. A trial step's press
//   arrives filled, from its own step diff, with its page's location where the
//   step gave one: a ledger that has read no page of it (a single-subflow
//   plan's supervisor, holding the judged run's acts) then still knows where
//   to look and where its control is. Until its page is read again a
//   press is unread, so the act it made cannot settle yet; a read of that page
//   reporting no controls at all reads it as showing none.
// - **Holding back.** A toggle holds when the last press at its place, landed
//   no earlier than the act, left that place at the build's start counts for
//   both states the toggle moved between, and the latest read of that press's
//   page, taken after the latest lasting call, still shows them. A control
//   that reverts by itself never holds: the return must follow a press.

import type { AutomationStudioSiteResetToggle } from "./toggle-witness.ts";

type Counts = Readonly<Record<string, number>>;

/** One landed press at a place: its page, the ledger clock it landed at, and the place's counts just before and, once read, just after it. */
export type AutomationStudioSiteResetPress = { page: string; place: string; clock: number; before: Counts; after?: Counts };

/** Whether a toggle is back: `holds`, `stale` (the page has not been read since the latest lasting call), or `open`; with where to look. */
export type AutomationStudioSiteResetToggleStanding = { status: "holds" | "stale" | "open"; location?: string };

export class AutomationStudioSiteResetControlTracker {
  private readonly pages = new Map<string, { controls: ReadonlyMap<string, Counts>; clock: number; location?: string }>();
  private readonly starts = new Map<string, Counts>();
  private readonly pending = new Map<string, AutomationStudioSiteResetPress>();
  private readonly last = new Map<string, AutomationStudioSiteResetPress>();
  private readonly locations = new Map<string, string>();
  /** The page the latest read named: where a press lands. */
  private current: string | undefined;

  /** A read of a page at `clock`; a read with no page leaves no page current. */
  read(read: { scope?: string | undefined; location?: string | undefined; controls?: Readonly<Record<string, Counts>> | undefined }, clock: number): void {
    this.current = read.scope;
    if (read.scope === undefined) return;
    if (read.location) this.locations.set(read.scope, read.location);
    if (!read.controls) {
      // A read of its page that reports no controls says nothing of them: a press pending there is read as showing none.
      for (const [place, press] of [...this.pending]) {
        if (press.page !== read.scope) continue;
        press.after = {};
        this.pending.delete(place);
      }
      return;
    }
    const controls = new Map(Object.entries(read.controls).map(([place, counts]) => [place, { ...counts }]));
    for (const [place, counts] of controls) if (!this.starts.has(place)) this.starts.set(place, counts);
    this.pages.set(read.scope, { controls, clock, ...(read.location ? { location: read.location } : {}) });
    for (const [place, press] of [...this.pending]) {
      if (press.page !== read.scope) continue;
      press.after = controls.get(place) ?? {};
      this.pending.delete(place);
      this.last.set(place, press);
    }
  }

  /** A press landed at `place` on the current page; filled by the next read of that page. None where no page is current. */
  press(place: string, clock: number): AutomationStudioSiteResetPress | undefined {
    const page = this.current;
    if (page === undefined) return undefined;
    const press: AutomationStudioSiteResetPress = { page, place, clock, before: this.pages.get(page)?.controls.get(place) ?? {} };
    this.pending.set(place, press);
    return press;
  }

  /** A press already read on both sides (a trial step's diff); a place never read before starts where the step found it. Its page's `location`, when given, is where that page is. */
  landed(page: string, place: string, before: Counts, after: Counts, clock: number, location?: string): AutomationStudioSiteResetPress {
    if (location) this.locations.set(page, location);
    if (!this.starts.has(place)) this.starts.set(place, { ...before });
    const press: AutomationStudioSiteResetPress = { page, place, clock, before: { ...before }, after: { ...after } };
    this.pending.delete(place);
    this.last.set(place, press);
    return press;
  }

  /** A press whose page has not been read since it landed: its witness is stale, and its page is where to look. */
  unread(press: AutomationStudioSiteResetPress): AutomationStudioSiteResetToggleStanding {
    const location = this.location(press.page);
    return { status: "stale", ...(location ? { location } : {}) };
  }

  /** Where `page` was last read, if a read named it. */
  location(page: string): string | undefined {
    return this.locations.get(page);
  }

  /** Whether `toggle` at `place` is back at the build's start (header), for an act that landed at `since`, judged against the ledger's `clock`. */
  standing(place: string, toggle: AutomationStudioSiteResetToggle, since: number, clock: number): AutomationStudioSiteResetToggleStanding {
    const press = this.last.get(place);
    const start = this.starts.get(place) ?? {};
    const back = (counts: Counts): boolean => (counts[toggle.from] ?? 0) === (start[toggle.from] ?? 0) && (counts[toggle.to] ?? 0) === (start[toggle.to] ?? 0);
    const location = press ? this.location(press.page) : undefined;
    const where = location ? { location } : {};
    if (!press?.after || press.clock < since || !back(press.after)) return { status: "open", ...where };
    const page = this.pages.get(press.page);
    if (!page || page.clock < clock) return { status: "stale", ...where };
    return back(page.controls.get(place) ?? {}) ? { status: "holds", ...where } : { status: "open", ...where };
  }
}
