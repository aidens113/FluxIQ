import { describe, expect, it } from "vitest";
import {
  AUTOMATION_STUDIO_SITE_RESET_WORDS as WORDS,
  AutomationStudioSiteResetProjectLedger,
  automationStudioSiteResetProjectReset,
  type AutomationStudioSiteResetChecks,
  type AutomationStudioSiteResetComparison,
  type AutomationStudioSiteResetExplored,
  type AutomationStudioSiteResetLedger,
  type AutomationStudioSiteResetRead
} from "../index.ts";

// What a witnessless trial or entry act adopts, narrowed (t743, rerun round 4
// office `run-mvgvyaip-d856e135`): every issued list was adopted, a search
// results list only a typed search reaches among them, Core's own look could
// not reach it in a later brief, and the act stayed open on it. Now only lists
// some act of the build named as where its effect shows, and lists read on the
// act's own page, are adopted; a list Core's look cannot read again is dropped;
// with nothing adoptable and no ref that could still be issued, no call can
// settle it. Made-up fixtures: a library with a finder, a shelf and a review
// page, opaque tokens only.

const SITE = "r:site";
type List = { scope: string; group: string; subjects: string[]; states: Record<string, string> };
const list = (scope: string, subjects: string[], group: string): List => ({ scope, group, subjects, states: Object.fromEntries(subjects.map((subject) => [subject, `v:${subject}`])) });
const page = (scope: string, location: string, collections: List[]): AutomationStudioSiteResetRead => ({ state: {}, differs: [], resource: SITE, scope, location, collections });
/** A finder's results, reached only by typing a query: a list the model merely read. */
const finder = () => page("p:finder-page", "loc:finder", [list("p:results", ["s:atlas", "s:primer"], "g:results")]);
const shelf = () => page("p:shelf-page", "loc:shelf", [list("p:shelf", ["s:held"], "g:shelf")]);
const review = () => page("p:review-page", "loc:review", [list("p:choices", ["s:first", "s:second"], "g:review")]);
const compare = async (): Promise<AutomationStudioSiteResetComparison> => ({ moved: false, differs: [] });
/** A press that hands an item to the shelf, naming the shelf's ref as where its effect shows (`hold`), from the item's own page. */
const hold = (resetDestination?: string): AutomationStudioSiteResetExplored => ({ callId: "hold", toolId: "core.run_node", landed: true, operation: "demo.hold", ...(resetDestination ? { resetDestination } : {}), declared: { permitted: true, effect: "mutate", consequences: ["create_new"], control: { name: "Hold", kind: "button", subject: "s:atlas", page: "s:atlas", resource: SITE }, verb: "press" } });
/** A later brief's entry preparation re-running the confirming step, on the page its step names. */
const confirm = (location: string) => ({ step: 2, definitionId: "demo.confirm", label: "confirm the choice", control: "Use this choice", consequences: ["modify_existing" as const], spot: { page: "s:confirm" }, controls: { page: `p:${location}`, location, before: {}, after: {} } });
const LEFT = `trial step 2 "confirm the choice" on "Use this choice" (${WORDS.leftUnchanged()})`;

/** A read routed as a running brief's permission gate routes it: the project, then every brief's ledger (the first brief's with a baseline). */
const routing = (project: AutomationStudioSiteResetProjectLedger) => (read: AutomationStudioSiteResetRead): void => {
  project.observed(read);
  for (const owner of new Set(["brief-1", ...project.snapshot().acts.map((act) => act.owner)])) project.forBrief(owner).observed(read, owner === "brief-1");
};
/** Checks whose `lookAt` routes the read at that location to every ledger; a location with no read answers unread. */
const looking = (project: AutomationStudioSiteResetProjectLedger, reads: Record<string, () => AutomationStudioSiteResetRead>) => {
  const looked: string[] = [];
  const checks: AutomationStudioSiteResetChecks = { compare, lookAt: async (location) => {
    looked.push(location);
    const read = reads[location];
    if (read) routing(project)(read());
  } };
  return { looked, checks };
};
/** Brief-1 read the finder, the shelf and the review page complete, each ref shown, and pressed Hold naming the shelf (or not). */
const explored = (named = true) => {
  const project = new AutomationStudioSiteResetProjectLedger();
  const first = project.forBrief("brief-1");
  const refs: string[] = [];
  for (const read of [finder(), shelf(), review()]) {
    routing(project)(read);
    refs.push(...first.destinationReceipts().map((receipt) => receipt.ref));
  }
  expect(refs).toEqual(["destination-1", "destination-2", "destination-3"]);
  first.explored(hold(named ? "destination-2" : undefined));
  routing(project)(shelf());
  return { project, first };
};
const settleOf = (decision: Awaited<ReturnType<AutomationStudioSiteResetLedger["beforeTrial"]>>, act: string): string => {
  const acts = decision.kind === "refuse" ? decision.evidence.actsToUndo : undefined;
  const found = Array.isArray(acts) ? acts.find((entry) => typeof entry === "object" && entry !== null && !Array.isArray(entry) && entry.act === act) : undefined;
  return typeof found === "object" && found !== null && !Array.isArray(found) && typeof found.settle === "string" ? found.settle : "";
};

describe("a witnessless trial act adopts only the lists it could have changed (office r4)", () => {
  it("adopts the list a press of the build named, never the finder's results nobody named: Core's look at the shelf settles it unchanged", async () => {
    const { project } = explored();
    const second = project.forBrief("brief-2");
    second.trialRan([confirm("loc:confirm")], "entry-preparation.brief-2");
    const { looked, checks } = looking(project, { "loc:shelf": shelf, "loc:finder": finder });
    const decision = await automationStudioSiteResetProjectReset({ project, own: second, checks: () => checks }).beforeTrial(undefined);
    expect(decision).toMatchObject({ kind: "admit", startedWith: { cannotUndo: [{ act: "act-2", did: LEFT }, { act: "act-1", call: "hold" }] } });
    // Only the shelf was looked at: the finder's results were never the act's to hold open.
    expect(looked).toEqual(["loc:shelf"]);
    expect(second.standing("act-2")).toBe("unchanged");
  });

  it("an adopted list Core's look reads unread twice does not hold the act open: dropped, the named list settles it", async () => {
    const { project } = explored();
    const second = project.forBrief("brief-2");
    // Its step ran on the review page: the list read there is adopted too.
    second.trialRan([confirm("loc:review")], "entry-preparation.brief-2");
    const { looked, checks } = looking(project, { "loc:shelf": shelf });
    const reset = automationStudioSiteResetProjectReset({ project, own: second, checks: () => checks });
    const first = await reset.beforeTrial(undefined);
    expect(first).toMatchObject({ kind: "refuse", evidence: { code: "candidate.trial_reset_required", actsToUndo: [{ act: "act-2" }] } });
    expect(settleOf(first, "act-2")).toBe("Read destination-3 at loc:review completely again.");
    expect(await reset.beforeTrial(undefined)).toMatchObject({ kind: "admit", startedWith: { cannotUndo: [{ act: "act-2", did: LEFT }, { act: "act-1" }] } });
    expect(looked).toEqual(["loc:shelf", "loc:review", "loc:review"]);
  });

  it("with nothing adoptable it is to name a list while a ref can be issued, and no call can settle it once none can", async () => {
    // Nothing named, and its page holds no list read: nothing to adopt; every ref was shown and the build has acted.
    const { project } = explored(false);
    const second = project.forBrief("brief-2");
    second.trialRan([confirm("loc:confirm")], "entry-preparation.brief-2");
    const { looked, checks } = looking(project, { "loc:shelf": shelf });
    const decision = await automationStudioSiteResetProjectReset({ project, own: second, checks: () => checks }).beforeTrial(undefined);
    expect(decision).toMatchObject({ kind: "refuse", evidence: { code: "candidate.trial_reset_required", actsUnsettleable: [{ act: "act-2", reason: "gate_unsatisfiable", failed: "nothing_to_name" }] } });
    expect(project.unsatisfiable().map((act) => [act.act, act.owner, act.failed])).toEqual([["act-2", "brief-2", "nothing_to_name"]]);
    expect(looked).toEqual([]);
    // Before any ref was shown, a ref can still be issued: it is the model's to name, as before.
    const open = new AutomationStudioSiteResetProjectLedger();
    routing(open)(shelf());
    const entry = open.forBrief("brief-2");
    entry.trialRan([confirm("loc:confirm")], "entry-preparation.brief-2");
    expect(entry.unsatisfiable()).toEqual([]);
    expect(entry.inPlace()[0]?.settle).toContain("(no ref has been shown yet)");
  });

  it("issuedRefs carries each shown ref's count and where it was read, on the brief's ledger and build-wide", () => {
    const { project, first } = explored();
    const issued = [{ ref: "destination-1", count: 2, location: "loc:finder" }, { ref: "destination-2", count: 1, location: "loc:shelf" }, { ref: "destination-3", count: 2, location: "loc:review" }];
    expect(project.issuedRefs()).toEqual(issued);
    expect(first.issuedRefs()).toEqual(issued);
    expect(project.forBrief("brief-2").issuedRefs()).toEqual(issued);
  });
});
