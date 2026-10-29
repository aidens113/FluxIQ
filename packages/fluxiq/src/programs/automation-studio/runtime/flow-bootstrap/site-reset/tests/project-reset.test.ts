import { describe, expect, it } from "vitest";
import type { AutomationStudioActionConsequence } from "../../../action-permissions/index.ts";
import type { AutomationStudioTrialChangeAsk } from "../../trial-change/index.ts";
import { AutomationStudioSiteResetLedger, AutomationStudioSiteResetProjectLedger, automationStudioSiteResetProjectReset, type AutomationStudioSiteResetChecks, type AutomationStudioSiteResetExplored, type AutomationStudioSiteResetRead, type AutomationStudioSiteResetSpot } from "../index.ts";

/** Whether a trial starts with acts of this build still on the site (t775: said under `startedWith.acts`; a trial is never refused for them). */
function stillOpen(decision: { kind: string; startedWith?: { acts?: unknown } }): boolean {
  return decision.kind === "admit" && Array.isArray(decision.startedWith?.acts) && decision.startedWith.acts.length > 0;
}

// F3's last note (`fix-f3-reset-brief-preflight.md`): once a reset brief came
// back blocked with two of the build's reversible acts still on the site, the
// supervisor's next whole trial ran (`start: not_reset`) and the build
// proposed. The whole trial asks the build's one reset
// (`../project-reset.ts`) with no look, and each brief's ledger answered a
// refusal identical to its last -- no progress -- by admitting the trial on
// the leftovers. The user's rule (2026-10-12): before every trial and the
// judged whole run the build's own lasting acts are undone; only an act the
// site truly cannot undo may stay, and the judge is told.

/** The supervisor's checks: it never looks at the target. */
const UNLOOKED: AutomationStudioSiteResetChecks = { compare: async () => ({ moved: false }) };

function built() {
  const project = new AutomationStudioSiteResetProjectLedger();
  const builder = project.forBrief("builder-1");
  for (const n of [1, 2]) builder.explored({ callId: `add.${n}`, toolId: "core.run_node", landed: true, declared: { permitted: true, effect: "mutate", consequences: ["create_new"], control: { name: "Add", kind: "button" }, verb: "press" } });
  return { project, reset: automationStudioSiteResetProjectReset({ project, checks: () => UNLOOKED }) };
}

describe("the whole trial's reset after a reset that made no progress", () => {
  it("refuses while the build's reversible acts are still on the site, however often it is asked", async () => {
    const { project, reset } = built();
    for (let ask = 0; ask < 5; ask += 1) {
      expect(await reset.beforeTrial(undefined)).toMatchObject({ kind: "admit", startedWith: { acts: [{ act: "act-1" }, { act: "act-2" }] } });
    }
    expect(project.snapshot().acts.map((act) => act.inPlace)).toEqual([true, true]);
  });

  it("runs only with acts named as ones the site cannot undo, each told to the judge, and refuses for any other still there", async () => {
    const { reset } = built();
    expect(stillOpen(await reset.beforeTrial(undefined))).toBe(true);
    expect(await reset.beforeTrial(undefined, ["act-1"])).toMatchObject({ kind: "admit", startedWith: { acts: [{ act: "act-2" }], cannotUndo: [{ act: "act-1" }] } });
    expect(await reset.beforeTrial(undefined, ["act-2"])).toMatchObject({ kind: "admit", startedWith: { cannotUndo: [{ act: "act-1" }, { act: "act-2" }] } });
  });
});

// t791 fix 4: a reversible lasting step with no witness stamp that resolves no longer refuses its trial. The admission notes
// it; the trial runs and is judged by its end view and done-when, the readings say the gap with the parts it serves
// `unproven`, and its act is recorded as on the site. The targeted end-state refusal stands. Made-up fixtures: a forum's
// follow (no witness) and a library's alert list.
describe("a trial with a step that has no witness (t791 fix 4)", () => {
  const FOLLOW: AutomationStudioSiteResetSpot = { subject: "s:author", page: "s:author", resource: "r:forum" };
  const follow = (parts: string[] = ["p1"]): AutomationStudioTrialChangeAsk["steps"][number] => ({ step: 1, definitionId: "forum.follow", label: "follow the author", consequences: ["modify_existing"], parts });
  const FOLLOWED = { id: "p1", effect: { kind: "end_state" as const, state: "following the author" } };

  it("is admitted with its note, runs judged by what Core could not read, and leaves its act on the site", async () => {
    const project = new AutomationStudioSiteResetProjectLedger();
    const own = project.forBrief("brief-1");
    const reset = automationStudioSiteResetProjectReset({ project, own, checks: () => UNLOOKED });
    const admission = reset.admit?.([{ step: 1, label: "follow the author", consequences: ["modify_existing"] }]);
    expect(admission).toMatchObject({ kind: "admit", unwitnessed: { steps: [{ step: 1, label: "follow the author" }] } });
    const note = (admission as { unwitnessed?: { instruction?: string } }).unwitnessed?.instruction ?? "";
    expect(note).toContain("the step \"follow the author\" (plan step 1)");
    expect(note).toContain("judged by its end view and each step's done-when check");
    expect(note).toContain("core.run_node");
    // No look and no other witness: the readings are still begun, to say the gap.
    const decision = await reset.beforeTrial(undefined, undefined, { change: { steps: [follow()], parts: [FOLLOWED] } });
    if (decision.kind !== "admit" || !decision.change) throw new Error(`expected readings, got ${JSON.stringify(decision)}`);
    const { siteChange } = await decision.change.finish([{ step: 1, definitionId: "forum.follow", outcome: "changed" }]);
    expect(siteChange.proofs).toEqual([{ part: "p1", effect: FOLLOWED.effect, proof: "unproven", steps: [1] }]);
    expect((siteChange as { unwitnessed?: unknown }).unwitnessed).toMatchObject({ steps: [{ label: "follow the author", ranAs: [1] }], parts: ["p1"] });
    // The trial's act is recorded as on the site, as an explored act with no witness is.
    const left = reset.trialRan([{ step: 1, definitionId: "forum.follow", label: "follow the author", consequences: ["modify_existing"], spot: FOLLOW }], "trial-1");
    expect(left).toMatchObject([{ act: "act-1", did: "trial step 1 \"follow the author\"" }]);
    expect(project.snapshot().acts).toMatchObject([{ act: "act-1", owner: "brief-1" }]);
  });

  it("begins no readings for a trial whose every lasting step has a resolving witness and nothing is on the site", async () => {
    const project = new AutomationStudioSiteResetProjectLedger();
    const reset = automationStudioSiteResetProjectReset({ project, own: project.forBrief("brief-1"), checks: () => UNLOOKED });
    expect(reset.admit?.([{ step: 1, consequences: [] }, { step: 2, consequences: ["move_money"] }])).toEqual({ kind: "admit" });
    const decision = await reset.beforeTrial(undefined, undefined, { change: { steps: [{ ...follow(), consequences: [] }], parts: [FOLLOWED] } });
    expect(decision).toEqual({ kind: "admit" });
  });

  it("still refuses a start already in an asked end state, naming just that act, beside a step with no witness", async () => {
    // The brief's ledger as `./ledger-trials.test.ts` makes the clash (`../../trial-change/tests/`): another step set the alert
    // while exploring and its change was seen; the trial's alert step asks that end state, beside a follow with no witness.
    const LIST = "loc:alerts";
    const BOOK: AutomationStudioSiteResetSpot = { subject: "s:atlas", page: "s:atlas", resource: "r:library" };
    const alerts = (rows: Record<string, string>): AutomationStudioSiteResetRead => ({ state: { page: "alerts", rows }, differs: [], location: LIST, resource: "r:library", scope: "p:alerts-page", collections: [{ scope: "p:alerts", group: "g:alerts", subjects: Object.keys(rows), states: rows }] });
    const shelf = (rows: Record<string, string>): AutomationStudioSiteResetRead => ({ state: { page: "shelf" }, differs: [], location: "loc:shelf", resource: "r:library", scope: "p:shelf-page", collections: [{ scope: "p:shelf", group: "g:shelf", subjects: Object.keys(rows), states: rows }] });
    const press = (callId: string, operation: string, consequences: AutomationStudioActionConsequence[], control: AutomationStudioSiteResetSpot, resetDestination: string): AutomationStudioSiteResetExplored => ({
      callId, toolId: "core.run_node", operation, landed: true, resetDestination,
      declared: { permitted: true, effect: "mutate", consequences, control: { name: "Set alert", kind: "button", ...control }, verb: "press" }
    });
    const own = new AutomationStudioSiteResetLedger();
    own.observed(alerts({ "s:atlas": "v:alert-off" }));
    // The ref is the model's once it is shown (`destinationReceipts`).
    expect(own.destinationReceipts().map((receipt) => receipt.ref)).toEqual(["destination-1"]);
    own.observed(shelf({ "s:atlas": "v:shelved" }));
    expect(own.destinationReceipts().map((receipt) => receipt.ref)).toEqual(["destination-2"]);
    own.explored(press("alert.other", "library.alert-panel", ["modify_existing"], BOOK, "destination-1"));
    own.observed(alerts({ "s:atlas": "v:alert-email" }));
    own.explored(press("shelve", "library.reshelve", ["modify_existing"], { ...BOOK, subject: "s:atlas-shelf" }, "destination-2"));
    own.observed(shelf({ "s:atlas": "v:moved" }));
    const reset = automationStudioSiteResetProjectReset({ project: new AutomationStudioSiteResetProjectLedger(), own, checks: () => UNLOOKED });
    const ask: AutomationStudioTrialChangeAsk = {
      steps: [{ step: 1, definitionId: "library.alert", consequences: ["modify_existing"], witness: { via: "destination", ref: "destination-1" }, parts: ["p2"] }, { ...follow([]), step: 2 }],
      parts: [{ id: "p2", effect: { kind: "end_state", state: "the reading-room alert is set to email" } }]
    };
    expect(reset.admit?.([{ step: 2, label: "follow the author", consequences: ["modify_existing"] }])).toMatchObject({ kind: "admit", unwitnessed: { steps: [{ step: 2 }] } });
    const refused = await reset.beforeTrial(undefined, undefined, { change: ask });
    expect(refused).toMatchObject({ kind: "refuse", moved: false, evidence: { code: "candidate.trial_starts_in_end_state", failed: "starts_in_end_state", actsToUndo: [{ act: "act-1" }] } });
    expect(refused.kind === "refuse" ? refused.evidence.actsToUndo : undefined).toHaveLength(1);
  });
});
