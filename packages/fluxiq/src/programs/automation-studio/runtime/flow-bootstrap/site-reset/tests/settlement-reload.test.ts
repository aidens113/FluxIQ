import { describe, expect, it } from "vitest";
import type { AutomationStudioActionConsequence } from "../../../action-permissions/index.ts";
import {
  AutomationStudioSiteResetLedger,
  type AutomationStudioSiteResetChecks,
  type AutomationStudioSiteResetComparison,
  type AutomationStudioSiteResetExplored,
  type AutomationStudioSiteResetRead,
  type AutomationStudioSiteResetSpot
} from "../index.ts";

// A list a site draws again only when it is loaded again (t751 final acceptance, headed job-unexplored-step on the job
// board's My jobs): after an undo lands, the read in place still shows the removed row. Core loads the named list again,
// once per landed undo, before it judges the act, and never calls the act unsettleable on that stale read
// (`../../reset-settlement/judge.ts`, `lookFirst`). Made-up fixtures: a saved list, opaque tokens only.

const SITE = "r:site";
type List = { scope: string; group: string; subjects: string[]; states: Record<string, string> };
const list = (scope: string, subjects: string[], group: string): List => ({ scope, group, subjects, states: Object.fromEntries(subjects.map((subject) => [subject, `v:${subject}`])) });
const page = (scope: string, location: string, collections: List[]): AutomationStudioSiteResetRead => ({ state: {}, differs: [], resource: SITE, scope, location, collections });
const press = (callId: string, consequences: AutomationStudioActionConsequence[], spot: AutomationStudioSiteResetSpot, extra: Partial<AutomationStudioSiteResetExplored> = {}): AutomationStudioSiteResetExplored =>
  ({ callId, toolId: "core.run_node", landed: true, operation: "demo.press", declared: { permitted: true, effect: "mutate", consequences, control: { name: "Press", kind: "button", ...spot }, verb: "press" }, ...extra });
const aim = (consequences: AutomationStudioActionConsequence[], control: AutomationStudioSiteResetSpot) => ({ effect: "mutate" as const, consequences, control });
const compare = async (): Promise<AutomationStudioSiteResetComparison> => ({ moved: false, differs: [] });
/** Checks whose `lookAt` feeds the read at that location to the ledger, as the caller's start check does, and records each look. */
const looking = (ledger: AutomationStudioSiteResetLedger, reads: Record<string, AutomationStudioSiteResetRead>) => {
  const looked: string[] = [];
  const checks: AutomationStudioSiteResetChecks = { compare, lookAt: async (location) => {
    looked.push(location);
    const read = reads[location];
    if (read) ledger.observed(read);
  } };
  return { looked, checks };
};
const minePage = () => page("p:mine-page", "loc:mine", [list("p:mine", ["s:held-a", "s:held-b"], "g:mine"), list("p:mine-old", ["s:held-c"], "g:mine")]);

describe("an undo whose list is drawn again only on its next load (job board My jobs)", () => {
  it("reloads a named list whose in-place read still shows the row after its undo landed, and admits the trial", async () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.observed(minePage());
    const ref = ledger.destinationReceipts()[0]!.ref;
    ledger.explored(press("save", ["modify_existing"], { subject: "s:atlas", page: "s:atlas", resource: SITE }, { resetDestination: ref }));
    const saved = () => page("p:mine-page", "loc:mine", [list("p:mine", ["s:held-a", "s:held-b", "s:atlas"], "g:mine"), list("p:mine-old", ["s:held-c"], "g:mine")]);
    ledger.observed(saved());
    const own: AutomationStudioSiteResetSpot = { scope: "p:mine", subject: "s:atlas", item: "i:atlas", resource: SITE };
    const admitted = ledger.target("act-1", aim(["modify_existing"], own));
    expect(admitted).toMatchObject({ kind: "admit" });
    ledger.explored(press("undo", ["modify_existing"], own, { undoes: "act-1", on: (admitted as { on: NonNullable<AutomationStudioSiteResetExplored["on"]> }).on }));
    // The read in place after the undo: the row is still drawn.
    ledger.observed(saved());
    const { looked, checks } = looking(ledger, { "loc:mine": minePage() });
    expect(await ledger.beforeTrial(checks)).toMatchObject({ kind: "admit" });
    expect(looked).toEqual(["loc:mine"]);
    expect(ledger.standing("act-1")).toBe("restored");
  });

  it("reloads it once per landed undo: a row the reload still shows stays to undo, and is not looked at again", async () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.observed(minePage());
    const ref = ledger.destinationReceipts()[0]!.ref;
    ledger.explored(press("save", ["modify_existing"], { subject: "s:atlas", page: "s:atlas", resource: SITE }, { resetDestination: ref }));
    const saved = () => page("p:mine-page", "loc:mine", [list("p:mine", ["s:held-a", "s:held-b", "s:atlas"], "g:mine"), list("p:mine-old", ["s:held-c"], "g:mine")]);
    ledger.observed(saved());
    const own: AutomationStudioSiteResetSpot = { scope: "p:mine", subject: "s:atlas", item: "i:atlas", resource: SITE };
    const admitted = ledger.target("act-1", aim(["modify_existing"], own));
    ledger.explored(press("undo", ["modify_existing"], own, { undoes: "act-1", on: (admitted as { on: NonNullable<AutomationStudioSiteResetExplored["on"]> }).on }));
    ledger.observed(saved());
    // The undo did not take: the reload still shows the row.
    const { looked, checks } = looking(ledger, { "loc:mine": saved() });
    expect(await ledger.beforeTrial(checks)).toMatchObject({ kind: "refuse", evidence: { code: "candidate.trial_reset_required" } });
    expect(await ledger.beforeTrial(checks)).toMatchObject({ kind: "refuse", evidence: { code: "candidate.trial_reset_required" } });
    expect(looked).toEqual(["loc:mine"]);
    expect(ledger.standing("act-1")).not.toBe("restored");
  });
});
