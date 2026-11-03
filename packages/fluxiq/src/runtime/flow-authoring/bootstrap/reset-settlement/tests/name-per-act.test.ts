import { describe, expect, it } from "vitest";
import {
  AutomationStudioSiteResetControlTracker,
  AutomationStudioSiteResetObservations,
  AutomationStudioSiteResetReach,
  AutomationStudioSiteResetSettlementJudge,
  type AutomationStudioSiteResetJudgedAct
} from "../index.ts";

// t751 R6: `name` is judged per act (a ref read before that act can be named
// for it; refs read only after it cannot), replacing `refsClosed`; and a
// witnessless trial act no longer adopts lists it never named. Generic
// fixtures: a library's shelves.

type Issued = { ref: string; scope: string; group: string; location?: string };

const SHELF: Issued = { ref: "destination-1", scope: "p:shelf", group: "g:shelf", location: "loc:shelf" };

/** `shown`: the refs whose receipts were printed; every other list in `issued` has a receipt not yet shown. */
function judged(issued: Issued[], refsClosed: boolean, shown: readonly string[] = issued.map((entry) => entry.ref)) {
  const seen = new AutomationStudioSiteResetObservations();
  const acts: AutomationStudioSiteResetJudgedAct[] = [];
  const state = { clock: 0 };
  // The ledger's receipts object still answers `refsClosed`; the judgement must not read it.
  const receipts = {
    named: (reference: unknown) => issued.find((entry) => entry.ref === reference && shown.includes(entry.ref)),
    described: (scope: string) => {
      const entry = issued.find((candidate) => candidate.scope === scope);
      return entry ? { ref: entry.ref, ...(entry.location ? { location: entry.location } : {}) } : undefined;
    },
    issuedRefs: () => issued.filter((entry) => shown.includes(entry.ref)).map((entry) => ({ ref: entry.ref, count: 2, ...(entry.location ? { location: entry.location } : {}) })),
    refsClosed: () => refsClosed
  };
  const judge = new AutomationStudioSiteResetSettlementJudge({ seen, tracker: new AutomationStudioSiteResetControlTracker(), reach: new AutomationStudioSiteResetReach(), receipts, acts: () => acts, clock: () => state.clock, explored: () => [] });
  return { seen, acts, state, judge };
}

const shelf = (books: string[]) => ({ location: "loc:shelf", collections: [{ scope: "p:shelf", group: "g:shelf", subjects: books, states: Object.fromEntries(books.map((book) => [book, `v:${book}`])) }] });

/** A trial step's act on a page with no list and no control of its own: no witness. */
const witnessless = (id: string, clock: number, call?: string): AutomationStudioSiteResetJudgedAct => ({ id, ...(call ? { call } : {}), spot: { page: "pg:desk" }, destinations: [], repeats: [], clock, changeSeen: false, attempts: 0 });

describe("naming a list for an act with no witness", () => {
  it("is meetable where an issued ref's list was read before the act, whether or not more refs can be issued", () => {
    const { seen, acts, state, judge } = judged([SHELF], true);
    seen.observe(shelf(["s:atlas", "s:primer"]), true, 0, 0);
    state.clock = 1;
    const act = witnessless("act-1", 1);
    acts.push(act);
    expect(judge.evaluate(act)).toEqual({ kind: "open", reasons: [{ reason: "name" }] });
    expect(judge.unmet(act)).toBeUndefined();
    expect(judge.settle(act)).toContain("destination-1 (2 items at loc:shelf)");
  });

  it("is `nothing_to_name` where every issued ref's list was read only after the act, and its words list none of them", () => {
    const { seen, acts, state, judge } = judged([SHELF], false);
    state.clock = 1;
    const act = witnessless("act-1", 1, "call-1");
    acts.push(act);
    seen.observe(shelf(["s:atlas", "s:primer"]), true, 1, 1);
    expect(judge.unmet(act)).toBe("nothing_to_name");
    const words = judge.settle(act) ?? "";
    expect(words).not.toContain("destination-1");
    expect(words).toMatch(/no call can settle it in this build/u);
  });

  it("counts a list read before the act whose receipt was not shown yet: reading it again prints its ref", () => {
    const { seen, acts, state, judge } = judged([SHELF], false, []);
    seen.observe(shelf(["s:atlas"]), true, 0, 0);
    state.clock = 1;
    const act = witnessless("act-1", 1, "call-1");
    acts.push(act);
    expect(judge.unmet(act)).toBeUndefined();
    expect(judge.settle(act)).toMatch(/\(no ref has been shown yet\)\.$/u);
  });

  it("judges each act by the refs read before it: an earlier act can name the list, a later one is told of it", () => {
    const { seen, acts, state, judge } = judged([SHELF], false);
    state.clock = 1;
    const early = witnessless("act-1", 1, "call-1");
    acts.push(early);
    seen.observe(shelf(["s:atlas"]), true, 1, 1);
    state.clock = 2;
    const late = witnessless("act-2", 2, "call-2");
    acts.push(late);
    expect([judge.unmet(early), judge.unmet(late)]).toEqual(["nothing_to_name", undefined]);
  });
});

describe("a witnessless trial act and the build's named lists (adoption deleted)", () => {
  it("no longer settles on a named list it never named: it stays open, to name its own", () => {
    const { seen, acts, state, judge } = judged([SHELF], true);
    seen.observe(shelf(["s:atlas", "s:primer"]), true, 0, 0);
    // An explored act named the shelf as where its effect shows.
    state.clock = 1;
    const named: AutomationStudioSiteResetJudgedAct = { id: "act-1", call: "call-1", spot: { page: "pg:catalogue" }, destinations: [{ scope: "p:shelf", group: "g:shelf" }], repeats: [], clock: 1, changeSeen: false, attempts: 0 };
    acts.push(named);
    // A trial step's act with no witness of its own; the shelf, read fresh after it, is as the build found it.
    state.clock = 2;
    const trial = witnessless("act-2", 2);
    acts.push(trial);
    seen.observe(shelf(["s:atlas", "s:primer"]), true, 2, 2);
    expect(judge.evaluate(named)).toEqual({ kind: "settled", how: "unchanged" });
    expect(judge.evaluate(trial)).toEqual({ kind: "open", reasons: [{ reason: "name" }] });
  });
});
