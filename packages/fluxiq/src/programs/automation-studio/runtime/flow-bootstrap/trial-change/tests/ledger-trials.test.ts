import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioActionConsequence } from "../../../action-permissions/index.ts";
import { AutomationStudioFlowCandidateTrialGate, type AutomationStudioCandidateTrialRequest, type AutomationStudioFlowCandidate } from "../../candidate/index.ts";
import { AutomationStudioSiteResetLedger, type AutomationStudioSiteResetExplored, type AutomationStudioSiteResetRead, type AutomationStudioSiteResetSpot } from "../../site-reset/index.ts";
import type { AutomationStudioTrialChangeAsk } from "../index.ts";

// A live trial judged by its change through a real ledger (t775 D1): acts of the build in place never refuse it, its
// witness is read just before it and again after it, and the one refusal left names just the act that already shows a
// step's asked end state. Generic fixtures: a library's holds list.

const SITE = "r:library";
const HOLDS = "loc:holds";
const BOOK: AutomationStudioSiteResetSpot = { subject: "s:atlas", page: "s:atlas", resource: SITE };
/** The holds page: one list, a row per held book with its copies as an opaque state; `lines` only where a start was given. */
const holds = (rows: Record<string, string>, lines?: { gone: string[]; added: string[] }): AutomationStudioSiteResetRead => ({
  state: { page: "holds", rows }, differs: [], location: HOLDS, resource: SITE, scope: "p:holds-page",
  collections: [{ scope: "p:holds", group: "g:holds", subjects: Object.keys(rows), states: rows }], ...(lines ? { lines } : {})
});
const shelf = (rows: Record<string, string>): AutomationStudioSiteResetRead => ({
  state: { page: "shelf" }, differs: [], location: "loc:shelf", resource: SITE, scope: "p:shelf-page",
  collections: [{ scope: "p:shelf", group: "g:shelf", subjects: Object.keys(rows), states: rows }]
});
const press = (callId: string, operation: string, consequences: AutomationStudioActionConsequence[], control: AutomationStudioSiteResetSpot, resetDestination?: string): AutomationStudioSiteResetExplored => ({
  callId, toolId: "core.run_node", operation, landed: true, ...(resetDestination ? { resetDestination } : {}),
  declared: { permitted: true, effect: "mutate", consequences, control: { name: "Place hold", kind: "button", ...control }, verb: "press" }
});
const compare = async () => ({ moved: false, differs: [] });
const step = (definitionId: string, ref: string, parts: string[] = []): AutomationStudioTrialChangeAsk["steps"][number] => ({ step: 1, definitionId, consequences: ["modify_existing"], witness: { via: "destination", ref }, parts });

describe("a live trial with this build's acts on the site (t775 D1)", () => {
  it("admits a trial while an explored creation is in place, and its judge's siteChange shows the witnessed row moving 9 -> 10", async () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.observed(holds({}));
    expect(ledger.destinationReceipts().map((receipt) => receipt.ref)).toEqual(["destination-1"]);
    // Exploring placed the hold, and its list was read after it: the creation is this build's, still on the site.
    ledger.explored(press("hold.atlas", "library.hold", ["create_new"], BOOK, "destination-1"));
    ledger.observed(holds({ "s:atlas": "v:copies-9" }));
    let site = { "s:atlas": "v:copies-9" };
    const looked: Array<{ location: string; start?: JsonObject }> = [];
    const lookAt = async (location: string, start?: JsonObject) => {
      looked.push({ location, ...(start ? { start } : {}) });
      ledger.observed(holds(site, start ? { gone: ["Atlas: 9 copies on hold"], added: ["Atlas: 10 copies on hold"] } : undefined));
    };
    const decision = await ledger.beforeTrial({ compare, lookAt }, undefined, { change: { steps: [step("library.hold", "destination-1")], parts: [] } });
    // No reset asked: the trial is admitted with the act said under startedWith, and its before read is the fresh latest read.
    expect(decision).toMatchObject({ kind: "admit", startedWith: { acts: [{ act: "act-1" }] } });
    expect(looked).toEqual([]);
    if (decision.kind !== "admit" || !decision.change) throw new Error("no readings were begun");
    // The trial adds one copy; the port finishes the readings after its end view.
    site = { "s:atlas": "v:copies-10" };
    const { siteChange, findings } = await decision.change.finish([{ step: 1, definitionId: "library.hold", witness: { via: "destination", ref: "destination-1" }, outcome: "changed" }]);
    expect(looked).toEqual([{ location: HOLDS, start: { page: "holds", rows: { "s:atlas": "v:copies-9" } } }]);
    expect(siteChange.witnesses).toEqual([{
      id: "w1", kind: "list", where: HOLDS, steps: [1], parts: [],
      before: { source: "latest_read", rows: 1 }, after: { source: "core_look", rows: 1 },
      change: { added: 0, removed: 0, changed: 1, unchanged: 0, lines: { gone: ["Atlas: 9 copies on hold"], added: ["Atlas: 10 copies on hold"] } }
    }]);
    expect(siteChange.acts).toEqual([{ step: 1, outcome: "changed", witness: "w1", parts: [] }]);
    expect(siteChange.leftFromEarlier).toEqual([{ did: "press \"Place hold\" button" }]);
    expect(findings).toEqual([]);
    expect(JSON.stringify(siteChange)).not.toMatch(/g:holds|s:atlas|v:copies/u);
  });

  it("admits a trial while an act no call can settle is on the site, naming it under leftFromEarlier", async () => {
    const ledger = new AutomationStudioSiteResetLedger();
    // A creation with no list read before it: nothing can ever be named for it, so no call can settle it.
    ledger.explored(press("hold.atlas", "library.hold", ["create_new"], BOOK));
    expect(ledger.unsatisfiable()).toMatchObject([{ act: "act-1" }]);
    const decision = await ledger.beforeTrial({ compare, lookAt: async () => undefined }, undefined, { change: { steps: [], parts: [] } });
    expect(decision).toMatchObject({ kind: "admit", startedWith: { acts: [{ act: "act-1", reason: "gate_unsatisfiable" }] } });
    if (decision.kind !== "admit" || !decision.change) throw new Error("no readings were begun");
    const { siteChange } = await decision.change.finish([]);
    expect(siteChange.leftFromEarlier).toEqual([{ did: "press \"Place hold\" button" }]);
  });

  it("refuses only an end state already shown by this build's act made with another step, naming just that act; with the step's own change seen earlier, it runs", async () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.observed(holds({ "s:atlas": "v:alert-off" }));
    expect(ledger.destinationReceipts().map((receipt) => receipt.ref)).toEqual(["destination-1"]);
    ledger.observed(shelf({ "s:atlas": "v:shelved" }));
    expect(ledger.destinationReceipts().map((receipt) => receipt.ref)).toEqual(["destination-2"]);
    // Another step set the alert while exploring, and its change was seen; an unrelated act changed another list.
    ledger.explored(press("alert.other", "library.alert-panel", ["modify_existing"], BOOK, "destination-1"));
    ledger.observed(holds({ "s:atlas": "v:alert-email" }));
    ledger.explored(press("shelve", "library.reshelve", ["modify_existing"], { ...BOOK, subject: "s:atlas-shelf" }, "destination-2"));
    ledger.observed(shelf({ "s:atlas": "v:moved" }));
    const ask: AutomationStudioTrialChangeAsk = { steps: [step("library.alert", "destination-1", ["p1"])], parts: [{ id: "p1", effect: { kind: "end_state", state: "the reading-room alert is set to email" } }] };
    const refused = await ledger.beforeTrial({ compare }, undefined, { change: ask });
    expect(refused).toMatchObject({ kind: "refuse", moved: false, evidence: { code: "candidate.trial_starts_in_end_state", failed: "starts_in_end_state", canMeet: "another_page", actsToUndo: [{ act: "act-1" }] } });
    expect(refused.kind === "refuse" ? refused.evidence.actsToUndo : undefined).toHaveLength(1);
    // The step itself was seen making that change earlier in the build: the run is proof as carried, so it runs.
    ledger.explored(press("alert.own", "library.alert", ["modify_existing"], BOOK, "destination-1"));
    ledger.observed(holds({ "s:atlas": "v:alert-off" }));
    ledger.observed(holds({ "s:atlas": "v:alert-email" }));
    expect(await ledger.beforeTrial({ compare }, undefined, { change: ask })).toMatchObject({ kind: "admit" });
  });
});

describe("the trial gate hands the port its change read only for a live trial (t775 D1)", () => {
  const latest = { revision: 1, digest: "d1", baseDependencyDigest: "b", status: "draft", summary: "s", buildPlan: {}, changedPaths: [] } as unknown as AutomationStudioFlowCandidate;
  const finished = { siteChange: { witnesses: [], acts: [], leftFromEarlier: [{ did: "an act" }], proofs: [] }, findings: [] };
  const reset = {
    beforeTrial: async () => ({ kind: "admit" as const, change: { finish: async () => finished } }),
    trialRan: () => []
  };

  it("passes a live trial's port a siteChange read that answers the readings, and an offline trial's port none", async () => {
    for (const environmentKind of ["live", "fixture"] as const) {
      const asked: AutomationStudioCandidateTrialRequest[] = [];
      const port = Object.assign(async (request: AutomationStudioCandidateTrialRequest) => {
        asked.push(request);
        return { revision: 1, digest: "d1", verdict: "unsure" as const, feedback: {} };
      }, { environmentKind });
      const gate = new AutomationStudioFlowCandidateTrialGate({ latest: () => latest, trial: { candidateId: "c", port }, reset });
      await gate.test({ revision: 1, digest: "d1" });
      expect(asked).toHaveLength(1);
      if (environmentKind === "live") expect(await asked[0]!.siteChange!([])).toEqual(finished);
      else expect(asked[0]!.siteChange).toBeUndefined();
    }
  });
});
