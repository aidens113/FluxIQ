import { describe, expect, it } from "vitest";
import type { AutomationStudioActionConsequence } from "../../../action-permissions/index.ts";
import {
  AUTOMATION_STUDIO_SITE_RESET_WORDS as WORDS,
  AutomationStudioSiteResetProjectLedger,
  type AutomationStudioSiteResetChecks,
  type AutomationStudioSiteResetComparison,
  type AutomationStudioSiteResetExplored,
  type AutomationStudioSiteResetLedger,
  type AutomationStudioSiteResetRead,
  type AutomationStudioSiteResetSpot
} from "../index.ts";

// One rule for repeats (L1 build repeats): a trial act repeats an explored act
// of any brief of its build. In a single-subflow plan the judged whole run's
// acts go to the supervisor's ledger, which holds none of the builder's
// explored acts; in a multi-subflow plan one brief's trial repeats another's
// press. Made-up fixtures: a recipe box, opaque tokens only.

const SITE = "r:site";
type List = { scope: string; group: string; subjects: string[]; states: Record<string, string> };
const list = (scope: string, subjects: string[]): List => ({ scope, group: "g:box", subjects, states: Object.fromEntries(subjects.map((subject) => [subject, `v:${subject}`])) });
const boxPage = (): AutomationStudioSiteResetRead => ({ state: {}, differs: [], resource: SITE, scope: "p:box-page", location: "loc:box", collections: [list("p:cards", ["s:soup", "s:stew"]), list("p:saved", ["s:pie"])] });
const DRAFT: AutomationStudioSiteResetSpot = { subject: "s:bread", page: "s:bread", resource: SITE };
const press = (callId: string, consequences: AutomationStudioActionConsequence[], extra: Partial<AutomationStudioSiteResetExplored> = {}): AutomationStudioSiteResetExplored => ({ callId, toolId: "core.run_node", landed: true, operation: "demo.press", declared: { permitted: true, effect: "mutate", consequences, control: { name: "Start a draft", kind: "button", ...DRAFT }, verb: "press" }, ...extra });
const look = (callId: string, undoes: string, resetDestination: string): AutomationStudioSiteResetExplored => ({ callId, toolId: "core.run_node", landed: true, undoes, on: "moving", resetDestination, declared: { permitted: true, effect: "observe", consequences: [], control: { name: null, kind: "page" }, verb: "read" } });
const trialStep = (definitionId: string) => ({ step: 3, definitionId, label: "start the draft", control: "Start a draft", consequences: ["create_new" as const], spot: { subject: "s:bread", page: "s:bread" } });
const compare = async (): Promise<AutomationStudioSiteResetComparison> => ({ moved: false, differs: [] });

/** A read routed as a running brief's permission gate routes it: the project, the brief's own ledger, and every other owner's without a baseline. */
const routing = (project: AutomationStudioSiteResetProjectLedger, own: AutomationStudioSiteResetLedger) => (read: AutomationStudioSiteResetRead): void => {
  project.observed(read);
  own.observed(read);
  for (const owner of new Set(project.snapshot().acts.map((act) => act.owner))) {
    const ledger = project.forBrief(owner);
    if (ledger !== own) ledger.observed(read, false);
  }
};
/** Checks whose `lookAt` routes the read at that location to every ledger, and records each look. */
const looking = (route: (read: AutomationStudioSiteResetRead) => void) => {
  const looked: string[] = [];
  const checks: AutomationStudioSiteResetChecks = { compare, lookAt: async (location) => {
    looked.push(location);
    if (location === "loc:box") route(boxPage());
  } };
  return { looked, checks };
};
const settleOf = (decision: Awaited<ReturnType<AutomationStudioSiteResetLedger["beforeTrial"]>>, act: string): string => {
  const acts = decision.kind === "refuse" ? decision.evidence.actsToUndo : undefined;
  const found = Array.isArray(acts) ? acts.find((entry) => typeof entry === "object" && entry !== null && !Array.isArray(entry) && entry.act === act) : undefined;
  return typeof found === "object" && found !== null && !Array.isArray(found) && typeof found.settle === "string" ? found.settle : "";
};
const LEFT = `trial step 3 "start the draft" on "Start a draft" (${WORDS.leftUnchanged()})`;

describe("a trial act repeats an explored act of any brief of its build (L1 build repeats)", () => {
  it("single subflow: the whole run's act in the supervisor's ledger inherits the builder's named list and settles on Core's look with no undo", async () => {
    const project = new AutomationStudioSiteResetProjectLedger();
    const builder = project.forBrief("brief:builder");
    const route = routing(project, builder);
    route(boxPage());
    expect(builder.destinationReceipts().map((receipt) => receipt.ref)).toEqual(["destination-1", "destination-2"]);
    builder.explored(press("start-draft", ["create_new"], { resetDestination: "destination-1" }));
    route(boxPage());
    // The judged whole run is the supervisor's: its acts go to the supervisor's ledger.
    const supervisor = project.forBrief("brief:supervisor");
    expect(supervisor.trialRan([trialStep("demo.press")], "trial.1").map((act) => act.act)).toEqual(["act-2"]);
    const { looked, checks } = looking(routing(project, builder));
    expect(await supervisor.beforeTrial(checks)).toMatchObject({ kind: "admit", startedWith: { cannotUndo: [{ act: "act-2", did: LEFT }] } });
    expect(looked).toEqual(["loc:box"]);
    expect(supervisor.standing("act-2")).toBe("unchanged");
    expect(supervisor.claim("act-2")).toMatchObject({ kind: "refused", evidence: { code: "candidate.undo_act_kept" } });
  });

  it("multi subflow: brief B's trial act repeating brief A's press inherits a list named for that press after the trial", async () => {
    const project = new AutomationStudioSiteResetProjectLedger();
    const briefA = project.forBrief("brief:a");
    routing(project, briefA)(boxPage());
    // The model is shown the box's refs.
    expect(briefA.destinationReceipts().map((receipt) => receipt.ref)).toEqual(["destination-1", "destination-2"]);
    briefA.explored(press("start-draft", ["create_new"]));
    const briefB = project.forBrief("brief:b");
    const route = routing(project, briefB);
    briefB.trialRan([trialStep("demo.press")], "trial.b1");
    // No list is named for the press yet: B's act is asked to name one.
    const refused = await briefB.beforeTrial(looking(route).checks);
    expect(refused).toMatchObject({ kind: "refuse", evidence: { code: "candidate.trial_reset_required", actsToUndo: [{ act: "act-2" }] } });
    expect(settleOf(refused, "act-2")).toContain("name that list's ref");
    // A look under `undoes` names the list for A's press, after B's trial.
    briefA.explored(look("look.box", "act-1", "destination-1"));
    const { looked, checks } = looking(route);
    expect(await briefB.beforeTrial(checks)).toMatchObject({ kind: "admit", startedWith: { cannotUndo: [{ act: "act-2", did: LEFT }] } });
    expect(looked).toEqual(["loc:box"]);
    expect(briefB.standing("act-2")).toBe("unchanged");
  });

  it("a trial act matching nothing across the build stays open, asking to name its list", async () => {
    const project = new AutomationStudioSiteResetProjectLedger();
    const briefA = project.forBrief("brief:a");
    routing(project, briefA)(boxPage());
    // The model is shown the box's refs.
    expect(briefA.destinationReceipts().map((receipt) => receipt.ref)).toEqual(["destination-1", "destination-2"]);
    briefA.explored(press("start-draft", ["create_new"], { resetDestination: "destination-1" }));
    const briefB = project.forBrief("brief:b");
    const route = routing(project, briefB);
    briefB.trialRan([trialStep("demo.other")], "trial.b1");
    const { looked, checks } = looking(route);
    const refused = await briefB.beforeTrial(checks);
    expect(refused).toMatchObject({ kind: "refuse", evidence: { code: "candidate.trial_reset_required", actsToUndo: [{ act: "act-2" }] } });
    expect(settleOf(refused, "act-2")).toContain("name that list's ref");
    expect(looked).toEqual([]);
    expect(briefB.standing("act-2")).toBe("in_place");
  });
});
