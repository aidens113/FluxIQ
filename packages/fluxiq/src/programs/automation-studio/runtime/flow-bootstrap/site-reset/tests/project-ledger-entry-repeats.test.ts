import { describe, expect, it } from "vitest";
import {
  AUTOMATION_STUDIO_SITE_RESET_WORDS as WORDS,
  AutomationStudioSiteResetProjectLedger,
  automationStudioSiteResetProjectReset,
  type AutomationStudioSiteResetChecks,
  type AutomationStudioSiteResetComparison,
  type AutomationStudioSiteResetLedger,
  type AutomationStudioSiteResetRead
} from "../index.ts";

// Office rerun round 3 (`run-mvgo5xft-25460ba2`): every brief's entry
// preparation re-ran its predecessor's confirming step, and each run left a new
// act in no list (act-15, act-18), each needing its own model look under
// `undoes`. Each now adopts the build's issued lists, so Core's own look before
// the judged whole trial settles all of them `unchanged`, and the trial is
// admitted with each told to its judge. Made-up fixtures: a recipe box, opaque
// tokens only.

const SITE = "r:site";
type List = { scope: string; group: string; subjects: string[]; states: Record<string, string> };
const list = (scope: string, subjects: string[]): List => ({ scope, group: "g:box", subjects, states: Object.fromEntries(subjects.map((subject) => [subject, `v:${subject}`])) });
const boxPage = (): AutomationStudioSiteResetRead => ({ state: {}, differs: [], resource: SITE, scope: "p:box-page", location: "loc:box", collections: [list("p:cards", ["s:soup", "s:stew"]), list("p:saved", ["s:pie"])] });
const compare = async (): Promise<AutomationStudioSiteResetComparison> => ({ moved: false, differs: [] });
const confirmStep = () => ({ step: 2, definitionId: "demo.confirm", label: "confirm the choice", control: "Use this choice", consequences: ["modify_existing" as const], spot: { page: "s:review" } });
const LEFT = `trial step 2 "confirm the choice" on "Use this choice" (${WORDS.leftUnchanged()})`;

/** A read routed as a running brief's permission gate routes it: the project, the brief's own ledger, and every other owner's without a baseline. */
const routing = (project: AutomationStudioSiteResetProjectLedger, own?: AutomationStudioSiteResetLedger) => (read: AutomationStudioSiteResetRead): void => {
  project.observed(read);
  own?.observed(read);
  for (const owner of new Set(project.snapshot().acts.map((act) => act.owner))) {
    const ledger = project.forBrief(owner);
    if (ledger !== own) ledger.observed(read, false);
  }
};

describe("entry-preparation repeats across a project build's briefs", () => {
  it("three briefs' entry acts, each in no list, all settle on Core's one look, and the next judged trial is admitted", async () => {
    const project = new AutomationStudioSiteResetProjectLedger();
    const first = project.forBrief("brief-1");
    routing(project, first)(boxPage());
    expect(first.destinationReceipts().map((receipt) => receipt.ref)).toEqual(["destination-1", "destination-2"]);
    // Brief-1's passing trial, then brief-2's, brief-3's and brief-4's entry preparations, each re-running the confirming step.
    first.trialRan([confirmStep()], "trial.brief-1");
    for (const brief of ["brief-2", "brief-3", "brief-4"]) project.forBrief(brief).trialRan([confirmStep()], `entry-preparation.${brief}`);
    expect(project.snapshot().acts.map((act) => [act.act, act.owner, act.inPlace])).toEqual([["act-1", "brief-1", true], ["act-2", "brief-2", true], ["act-3", "brief-3", true], ["act-4", "brief-4", true]]);
    // The supervisor's judged whole trial: one reset over every ledger, whose looks reach every ledger.
    const looked: string[] = [];
    const checks: AutomationStudioSiteResetChecks = { compare, lookAt: async (location) => {
      looked.push(location);
      if (location === "loc:box") routing(project)(boxPage());
    } };
    const reset = automationStudioSiteResetProjectReset({ project, checks: () => checks });
    const decision = await reset.beforeTrial(undefined);
    expect(decision).toMatchObject({ kind: "admit", startedWith: { cannotUndo: ["act-1", "act-2", "act-3", "act-4"].map((act) => ({ act, did: LEFT })) } });
    expect(looked).toEqual(["loc:box"]);
    expect(project.snapshot().acts.every((act) => !act.inPlace)).toBe(true);
    // Sticky: after the judged trial, the next ask needs no look and still tells the judge.
    reset.trialRan([], "whole.1");
    expect(await reset.beforeTrial(undefined)).toMatchObject({ kind: "admit", startedWith: { cannotUndo: [{ act: "act-1" }, { act: "act-2" }, { act: "act-3" }, { act: "act-4" }] } });
    expect(looked).toEqual(["loc:box"]);
  });
});
