// Which list groups Core's own look cannot read again, for every act of one
// build (t743, rerun round 4 photo `run-mvgw7320-de416190`).
//
// On photo a list named for a press was first read in a view shown over
// another page, and its stored location was that view's address. Loading the
// address gave a different document, so Core's own look before each trial
// never read that list again, the act kept a `look` reason forever, and no
// call the builder could make met it. A group is lost here when Core's look at
// its location lands and the read still does not show it fresh and complete,
// or when that look answers unread in two separate pre-trial checks
// (`./judge.ts`). Lost is for the whole build: one store is shared by every
// brief's ledger of a project build (`../site-reset/project-ledger.ts`), and a
// lost group is never a `look` again (`./decision.ts`). Opaque group tokens
// only.

export class AutomationStudioSiteResetReach {
  private readonly lostGroups = new Set<string>();

  /** `group` cannot be read again by Core's own look: for every act of the build, from now on (header). */
  lost(group: string): void {
    this.lostGroups.add(group);
  }

  /** Whether `group` was lost (header); never for an absent group. */
  unreachable(group: string | undefined): boolean {
    return group !== undefined && this.lostGroups.has(group);
  }
}
