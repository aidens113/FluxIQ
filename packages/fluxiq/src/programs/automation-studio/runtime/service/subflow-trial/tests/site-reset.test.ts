import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioNodeRegistry, canonicalBuiltinAutomationNodeDefinitions, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import { AutomationStudioSiteResetLedger, type AutomationStudioSiteResetComparison, type AutomationStudioSiteResetTrialReset } from "../../../flow-bootstrap/site-reset/index.ts";
import { AutomationStudioSubflowTrialGate } from "../../../flow-bootstrap/subflow-candidate/index.ts";
import { automationStudioSubflowTrialPort, type AutomationStudioSubflowTrialPorts } from "../index.ts";
import { PRESS, subflowTrialFixture as fixture } from "./fixtures.ts";

// The A8 bigbox debug's cause A and fix 2 (t578), end to end through the gate,
// the port and the partial runner, on a stub site: a builder's act added a
// line, and the builder left the tab on another page. The next subflow trial
// must undo that act and start on a loaded start page.

const START = "https://site.test/start";
const GO: AutomationStudioNodeDefinition = {
  ...PRESS, id: "custom.go", label: "Go", description: "Loads a location in the tab",
  source: { kind: "code", moduleId: "test", implementationKey: "test.go", trust: "trusted-local" },
  parameters: [{ id: "location", label: "Location", valueType: "string", required: true }]
};

/** The stub site: the builder's line, the tab's page, and what ran on which page. */
function site(options: { hook: boolean }) {
  const f = fixture();
  const state = { lines: ["line added by the builder"], tab: "https://site.test/elsewhere", hooks: 0, ran: [] as Array<{ node: string; on: string }> };
  const ports: AutomationStudioSubflowTrialPorts = {
    ...f.ports,
    registry: new AutomationStudioNodeRegistry([...canonicalBuiltinAutomationNodeDefinitions, PRESS, GO]),
    startLocation: START,
    arrival: { node: GO.id, parameter: "location" },
    // The Lab's hook resets the server's state; the tab still shows whatever page it showed.
    ...(options.hook ? { prepareStart: async () => {
      state.hooks += 1;
      state.lines = [];
      return { reset: true };
    } } : {}),
    graphOptions: ({ signal }) => ({ signal, now: () => 100, nativeNodeExecutor: async ({ node }) => {
      if (node.definitionId === GO.id) state.tab = String(node.parameterValues?.location);
      state.ran.push({ node: node.definitionId, on: state.tab });
      return { result: { status: "success", route: "success", outputs: {} } };
    } })
  };
  // The brief's ledger holds the builder's act, placed on the page it was made on.
  const ledger = new AutomationStudioSiteResetLedger();
  ledger.explored({ callId: "call.7", toolId: "core.run_node", landed: true, declared: { permitted: true, effect: "mutate", consequences: ["create_new"], control: { name: "Add", kind: "button" }, verb: "press" } });
  ledger.placed("act-1", { state: {}, location: "https://site.test/item", changed: ["line added by the builder"] });
  const look = async (): Promise<AutomationStudioSiteResetComparison> => ({ moved: true, differs: [...state.lines] });
  const reset: AutomationStudioSiteResetTrialReset = {
    beforeTrial: (_signal, cannotUndo, beforeOptions) => ledger.beforeTrial({ compare: look, compareAt: look }, cannotUndo, beforeOptions),
    trialRan: (acts, trialRunId) => ledger.trialRan(acts, trialRunId)
  };
  const trials = automationStudioSubflowTrialPort("build.1", ports);
  const request = f.request();
  const gate = new AutomationStudioSubflowTrialGate({ scope: request.scope, latest: () => structuredClone(request.proposal), port: trials.port, reset });
  return { f, state, ledger, gate, trials, receipt: { revision: request.proposal.revision, digest: request.proposal.digest } };
}

describe("a subflow trial after a builder's act left the site changed and the tab elsewhere (t578)", () => {
  it("with a start hook: the hook runs once, ahead of the reset, the act counts undone, and every step runs on the loaded start page", async () => {
    const { state, ledger, gate, trials, receipt } = site({ hook: true });
    const ran = await gate.test(receipt);
    expect(ran.evidence, JSON.stringify(ran.evidence)).toMatchObject({ verdict: "yes", entryPrepared: true, absorbedByStartReset: [{ act: "act-1", did: "press \"Add\" button", call: "call.7" }] });
    expect(state.hooks).toBe(1);
    expect(state.lines).toEqual([]);
    // The start page is loaded first, then the predecessor's and the brief's own steps run on it.
    expect(state.ran.map((step) => step.node)).toEqual([GO.id, PRESS.id, PRESS.id]);
    expect(state.ran.every((step) => step.on === START)).toBe(true);
    // The hook's start is the trial's: it was recorded, and not made a second time.
    expect(trials.records()).toMatchObject([{ start: { status: "reset" }, execution: "succeeded", verdict: "yes" }]);
    // What the trial itself left is the ledger's to undo before the next trial; the builder's act is not.
    const left = (ran.evidence as JsonObject).leftOnSite as Array<{ act: string; did: string }>;
    expect(left.map((act) => act.act)).toEqual(["act-2", "act-3"]);
    expect(left.every((act) => act.did.startsWith("trial step ") && act.did.endsWith(PRESS.id))).toBe(true);
    expect(ledger.inPlace().map((act) => act.act)).toEqual(["act-2", "act-3"]);
  });

  it("with a start hook and no prepared entry: nothing runs, but the site is put back all the same", async () => {
    const { f, state, ledger, gate, trials, receipt } = site({ hook: true });
    f.setPredecessors([]);
    const ran = await gate.test(receipt);
    expect(ran.evidence).toMatchObject({ verdict: "execution_failed", entryPrepared: false, feedback: { code: "subflow.trial_predecessor_missing" } });
    expect(state.hooks).toBe(1);
    expect(state.lines).toEqual([]);
    expect(state.ran).toEqual([]);
    expect(ledger.inPlace()).toEqual([]);
    expect(trials.records()).toMatchObject([{ start: { status: "reset" }, execution: "not_run" }]);
  });

  it("without a hook: the trial runs with the builder's act still in place, said under startedWith, on the loaded start page (t775)", async () => {
    const { f, state, gate, receipt } = site({ hook: false });
    const ran = await gate.test(receipt);
    expect(ran.evidence, JSON.stringify(ran.evidence)).toMatchObject({ verdict: "yes", entryPrepared: true, startedWith: { acts: [{ act: "act-1", stillThere: ["line added by the builder"] }] } });
    expect(ran.resultCode).not.toBe("candidate.trial_reset_required");
    expect(f.sessions.length).toBeGreaterThan(0);
    expect(state.ran.map((step) => step.node)).toEqual([GO.id, PRESS.id, PRESS.id]);
    expect(state.ran.every((step) => step.on === START)).toBe(true);
  });
});

describe("the port's prepareStart", () => {
  it("is absent without a start hook, so a gate given a reset asks the reset alone", () => {
    const f = fixture();
    expect(automationStudioSubflowTrialPort("build.1", f.ports).port.prepareStart).toBeUndefined();
  });
});
