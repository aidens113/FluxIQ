// What the build has seen of the site's stateful controls (L1 reset
// settlement): the evidence a toggle's witness is judged on
// (`./toggle-witness.ts`, `../site-reset/ledger.ts`).
//
// - **Per page.** Every read that names its page (`scope`) and reports its
//   controls replaces what is known of that page: a place a later read of it
//   does not report has no such control there now, so it counts as empty.
// - **Build start, per place (t751 R1).** The counts a place showed the first
//   time a read reported it while no press of the build at that place was
//   ever recorded (pending, filled, or `touched`). A place is a slot the
//   domain names independently of the page it is read on (a post's like
//   shares its place in a dialog and on the post's own page), so its start is
//   one per place. A trial step's diff (`landed`) seeds it from the step's
//   `before` only where the place has no start and no earlier press. Anywhere
//   else the start is unproven: a read after the build's own act there would
//   seed the act's own state as the start, and the reset would re-apply the
//   act (photo `run-mvhibis0-b536958b`: a trial step's `before` was the like an
//   earlier trial step had made, and the reset liked the post again).
// - **Presses.** A landed press at a place is pending until the next read of
//   the page it was pressed on, which fills its counts after it; its counts
//   before it are the latest read of that page. The last filled press per
//   place is kept with the ledger clock it landed at. A trial step's press
//   arrives filled, from its own step diff, with its page's location where the
//   step gave one: a ledger that has read no page of it (a single-subflow
//   plan's supervisor, holding the judged run's acts) then still knows where
//   to look and where its control is. Until its page is read again a
//   press is unread, so the act it made cannot settle yet; a read of that page
//   reporting no controls at all reads it as showing none. A lasting act at a
//   place whose step reported no controls is `touched`: a press with no counts.
// - **Holding back, by observed state (t751 R2).** A toggle holds when the
//   latest read of its place -- the most recent read of any page reporting the
//   place, or of the page its last press landed on, whichever came last -- was
//   taken after the act and at the ledger's current clock, and shows the place
//   at the build's start counts for both states the toggle moved between,
//   whatever put it back: the site, a fresh session, or a press (office
//   `run-mvhibit5-e1d3a4f3`: a checkbox ticked again by a fresh session could
//   never settle while the return had to follow a press). `stale` when that
//   read is not at the current clock (or no read of the place was taken),
//   `unproven` when the place has no start (above): no read can show it put
//   back, and `open` otherwise.

import { automationStudioSiteResetToggleWitness, type AutomationStudioSiteResetToggle } from "./toggle-witness.ts";

type Counts = Readonly<Record<string, number>>;

/** One landed press at a place: its page, the ledger clock it landed at, and the place's counts just before and, once read, just after it. */
export type AutomationStudioSiteResetPress = { page: string; place: string; clock: number; before: Counts; after?: Counts };

/** Whether a toggle is back: `holds`, `stale` (its place has not been read since the latest lasting call), `unproven` (its place's start was never read before the build acted there, header), or `open`; with where to look. */
export type AutomationStudioSiteResetToggleStanding = { status: "holds" | "stale" | "unproven" | "open"; location?: string };

/** One page's latest read: its controls, the ledger clock, the read's order among every read (`seq`), and where. */
type PageRead = { controls: ReadonlyMap<string, Counts>; clock: number; seq: number; resource?: string; location?: string };

export class AutomationStudioSiteResetControlTracker {
  private readonly pages = new Map<string, PageRead>();
  private readonly starts = new Map<string, Counts>();
  /** Every place a press of the build was ever recorded at (header): no later read or diff seeds its start. */
  private readonly pressed = new Set<string>();
  private reads = 0;
  private readonly pending = new Map<string, AutomationStudioSiteResetPress>();
  private readonly last = new Map<string, AutomationStudioSiteResetPress>();
  private readonly locations = new Map<string, string>();
  /** The page the latest read named: where a press lands. */
  private current: string | undefined;

  /** A read of a page at `clock`; a read with no page leaves no page current. */
  read(read: { resource?: string | undefined; scope?: string | undefined; location?: string | undefined; controls?: Readonly<Record<string, Counts>> | undefined }, clock: number): void {
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
    // A place's start is its first report while no press of the build was ever recorded there (header, R1).
    for (const [place, counts] of controls) if (!this.starts.has(place) && !this.pressed.has(place)) this.starts.set(place, counts);
    this.reads += 1;
    this.pages.set(read.scope, { controls, clock, seq: this.reads, ...(read.resource ? { resource: read.resource } : {}), ...(read.location ? { location: read.location } : {}) });
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
    this.pressed.add(place);
    return press;
  }

  /** A lasting act landed at `place` with no counts read around it (a trial step whose diff reported no controls): a press there, so no later read or diff seeds its start (header, R1). */
  touched(place: string): void {
    this.pressed.add(place);
  }

  /** A press already read on both sides (a trial step's diff); a place with no start and no earlier press starts where the step found it (header, R1). Its page's `location`, when given, is where that page is. */
  landed(page: string, place: string, before: Counts, after: Counts, clock: number, location?: string): AutomationStudioSiteResetPress {
    if (location) this.locations.set(page, location);
    if (!this.starts.has(place) && !this.pressed.has(place)) this.starts.set(place, { ...before });
    this.pressed.add(place);
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

  /** A retained pre-admission original is authoritative even when an optional runtime diff supplied no control evidence. */
  originalStanding(original: { resource: string; page: string; place: string; before: Counts; location?: string }, since: number, clock: number): AutomationStudioSiteResetToggleStanding {
    const latest = this.latest(original.place, original.page, original.resource);
    const location = latest?.location ?? original.location;
    const where = location ? { location } : {};
    if (!latest || latest.clock < since || latest.clock < clock) return { status: "stale", ...where };
    const current = latest.controls.get(original.place) ?? {};
    const back = [...new Set([...Object.keys(original.before), ...Object.keys(current)])].every((state) => (original.before[state] ?? 0) === (current[state] ?? 0));
    return { status: back ? "holds" : "open", ...where };
  }

  /** Infer an inverse only when a fresh read proves exactly one original control changed state. */
  originalToggle(original: { resource: string; page: string; place: string; before: Counts }, since: number, clock: number): ({ page: string; place: string } & AutomationStudioSiteResetToggle) | undefined {
    const latest = this.latest(original.place, original.page, original.resource);
    if (!latest || latest.clock < since || latest.clock < clock) return undefined;
    const after = latest.controls.get(original.place) ?? {};
    for (const state of Object.keys(original.before)) {
      const toggle = automationStudioSiteResetToggleWitness({ state, before: original.before, after });
      if (toggle) return { page: original.page, place: original.place, ...toggle };
    }
    return undefined;
  }

  /** Whether `toggle` at `place` is back at the build's start (header), for an act that landed at `since`, judged against the ledger's `clock`. */
  standing(place: string, toggle: AutomationStudioSiteResetToggle, since: number, clock: number): AutomationStudioSiteResetToggleStanding {
    const press = this.pending.get(place) ?? this.last.get(place);
    const latest = this.latest(place, press?.page);
    const location = latest?.location ?? (press ? this.location(press.page) : undefined);
    const where = location ? { location } : {};
    const start = this.starts.get(place);
    // Never read before the build acted there: nothing read can show it put back (header, R1).
    if (!start) return { status: "unproven", ...where };
    if (!latest || latest.clock < since || latest.clock < clock) return { status: "stale", ...where };
    const counts = latest.controls.get(place) ?? {};
    const back = (counts[toggle.from] ?? 0) === (start[toggle.from] ?? 0) && (counts[toggle.to] ?? 0) === (start[toggle.to] ?? 0);
    return { status: back ? "holds" : "open", ...where };
  }

  /** The latest read of `place` (header): the most recent read of a page reporting it, or of `pressPage`, whichever came last. */
  private latest(place: string, pressPage: string | undefined, resource?: string): PageRead | undefined {
    let found: PageRead | undefined;
    for (const [page, read] of this.pages) {
      if (resource !== undefined && read.resource !== resource) continue;
      if (page !== pressPage && !read.controls.has(place)) continue;
      if (!found || read.seq > found.seq) found = read;
    }
    return found;
  }
}
