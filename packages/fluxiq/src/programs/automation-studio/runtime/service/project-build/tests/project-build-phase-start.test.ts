// Every phase of a project build through the build's one start (`../phase-start.ts`, t593), on one stub site, with and
// without a deployment start hook. The site is the A8 bigbox shape: an earlier phase left one act of this build in place
// (act-1, a lasting "Add") and one press that declared nothing lasting but had an effect (act-2, possibly lasting), and the
// tab shows some other page. The hook, where there is one, resets the site's server state and leaves the tab where it is.
//
// For each phase the start's steps are asserted:
// (a) the hook ran, or there is none;
// (b) after a hook every act of this build counts undone, and each lasting one is named (a possibly lasting press is taken
//     back unnamed); without one, the acts still in place are told (a trial runs with them, its judge told them: t775),
//     and the possibly lasting press is told but never refuses anything;
// (c) the phase arrives at the build's start location: a run Core makes opens by loading it, a phase a model explores in
//     opens with the domain's arriving look;
// (d) a phase that begins after a predecessor has its latest passing proposal run first, from the start location;
// (e) the phase is told which of these ran and on what page it stands, under `phaseStart`.
//
// Builder, repair and reset explorations run through `explore`; a builder's subflow trial through its real gate and the
// build's subflow trial port; the whole trial through its real gate, the build's one reset as the supervisor asks it (no
// brief of its own) and the build's whole trial port, on the Flow assembly writes. Every run is the real detached runner
// over a stub native executor. The whole trial's readings through Core's own look (t775 D5) are the last describe's.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioNodeRegistry, canonicalBuiltinAutomationNodeDefinitions, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import type { AutomationStudioActionConsequence } from "../../../action-permissions/index.ts";
import { AutomationStudioFlowCandidateTrialGate, type AutomationStudioFlowCandidate } from "../../../flow-bootstrap/candidate/index.ts";
import { validateAutomationStudioFlowBootstrapPlan, type AutomationStudioFlowBootstrapSubflow } from "../../../flow-bootstrap/plan/index.ts";
import { AutomationStudioSiteResetProjectLedger, type AutomationStudioSiteResetComparison, type AutomationStudioSiteResetExplored } from "../../../flow-bootstrap/site-reset/index.ts";
import { AutomationStudioSubflowTrialGate, type AutomationStudioSubflowProposal, type AutomationStudioSubflowScope } from "../../../flow-bootstrap/subflow-candidate/index.ts";
import { automationStudioArrivalPlanNode } from "../../../flow-bootstrap/verification/index.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding } from "../../../llm/index.ts";
import { automationStudioProjectStructurePlan, automationStudioProjectTaskSpec } from "../../../project-agents/contracts/index.ts";
import { AutomationStudioHostLeaseScope, AutomationStudioHostResourceScheduler } from "../../../project-agents/host-resources/index.ts";
import { StubHost } from "../../../project-agents/host-resources/tests/stub-host.ts";
import { automationStudioProjectAssembly } from "../../../project-agents/supervisor/index.ts";
import { judgeReply, mockProvider } from "../../../tests/service-bootstrap/tests/fixtures.ts";
import { PRESS, part, subflowTrialFixture } from "../../subflow-trial/tests/fixtures.ts";
import { AutomationStudioProjectBuildPhaseStart } from "../phase-start.ts";
import { automationStudioProjectBuildPhaseStartTold } from "../phase-start-told.ts";
import { AutomationStudioProjectBuildProposals } from "../proposals.ts";
import { automationStudioProjectBuildSubflowTrials } from "../subflow-trials.ts";
import { automationStudioProjectBuildWholeTrials, type AutomationStudioProjectBuildTrialEnvironment } from "../whole-trials.ts";

const START = "https://site.test/start";
const ELSEWHERE = "https://site.test/elsewhere";
const GO: AutomationStudioNodeDefinition = {
  ...PRESS, id: "custom.go", label: "Go", description: "Loads a location in the tab",
  source: { kind: "code", moduleId: "test", implementationKey: "test.go", trust: "trusted-local" },
  parameters: [{ id: "location", label: "Location", valueType: "string", required: true }]
};
const ARRIVAL = { node: GO.id, parameter: "location" };
const POSSIBLY = "(declared no lasting act, but had an effect: possibly lasting)";

/** Direct proposals use the same source-derived admission as submitted domain declarations. */
function stampParts(project: AutomationStudioSiteResetProjectLedger, subflows: readonly AutomationStudioFlowBootstrapSubflow[]): void {
  const authority = project.forBrief("brief.authority");
  for (const subflow of subflows) for (const node of subflow.nodes) {
    if (!node.consequences?.length) continue;
    const stamp = authority.admitStep({ effect: "mutate", consequences: node.consequences as AutomationStudioActionConsequence[], control: { name: "Press", kind: "button", resource: "r:phase", scope: "p:phase", subject: `s:${node.key}` } }, node.definitionId);
    expect(stamp).toEqual({ via: "destination", ref: "destination-1" });
    node.resetWitness = stamp!;
  }
}

/** One press the model made while exploring, as the build's permission wrapper tells the ledger. */
const acted = (callId: string, consequences: AutomationStudioActionConsequence[], extra: Partial<AutomationStudioSiteResetExplored> = {}): AutomationStudioSiteResetExplored => ({
  callId, toolId: "core.run_node", landed: true, declared: { permitted: true, effect: "mutate", consequences, control: { name: "Add", kind: "button" }, verb: "press" }, ...extra
});

/** The stub site and the build around it (header). */
function site(options: { hook: boolean }) {
  const f = subflowTrialFixture();
  const state = { tab: ELSEWHERE, hooks: 0, ran: [] as string[] };
  const registry = new AutomationStudioNodeRegistry([...canonicalBuiltinAutomationNodeDefinitions, PRESS, GO]);
  const { judge: _judge, predecessorProposals: _predecessors, ...ports } = f.ports;
  const environment: AutomationStudioProjectBuildTrialEnvironment = {
    ...ports,
    registry,
    startLocation: START,
    // The Lab's hook resets the server's state; the tab still shows whatever page it showed.
    ...(options.hook ? { prepareStart: async () => {
      state.hooks += 1;
      state.ran.push("hook");
      return { reset: true };
    } } : {}),
    // The real clock, as a run has: an entry's start is stamped with it.
    graphOptions: ({ signal }) => ({ signal, nativeNodeExecutor: async ({ node }) => {
      if (node.definitionId === GO.id) state.tab = String(node.parameterValues?.location);
      state.ran.push(node.definitionId === GO.id ? `go ${state.tab}` : `${node.definitionId} on ${state.tab}`);
      return { result: { status: "success", route: "success", outputs: {} } };
    } })
  };
  // What an earlier phase left: a lasting act, and a press that declared nothing lasting (header).
  const ledger = new AutomationStudioSiteResetProjectLedger();
  const authority = ledger.forBrief("brief.authority");
  const original = { state: {}, differs: [], resource: "r:phase", scope: "p:phase", collections: [{ scope: "p:phase", group: "g:phase", subjects: [], states: {} }] };
  ledger.observed(original);
  authority.observed(original);
  authority.destinationReceipts();
  stampParts(ledger, f.findProposal.subflows);
  const earlier = ledger.forBrief("brief.earlier");
  earlier.explored(acted("call.add", ["create_new"]));
  earlier.explored(acted("call.coupon", []));
  // The predecessor's passing proposal.
  const proposals = new AutomationStudioProjectBuildProposals();
  proposals.trialled(scopeOf("find", "brief.find", []), f.findProposal, "yes");
  const start = new AutomationStudioProjectBuildPhaseStart({ environment, arrival: ARRIVAL, ledger, proposals });
  /** The model undoes act-1 through the site's own control, and the undo changed its page. */
  const undoAdd = () => {
    earlier.explored(acted("undo.add", ["delete"], { undoes: "act-1", on: "moving" }));
    earlier.undoSeen("act-1", true);
  };
  return { f, state, environment, registry, ledger, proposals, start, undoAdd };
}

function scopeOf(subflowKey: string, briefId: string, predecessors: string[]): AutomationStudioSubflowScope {
  return { buildId: "build.1", briefId, planDigest: "plan.1", subflowKey, predecessors, parts: [{ partId: "part.1", sourceId: "instruction", text: "carry out its part" }], interface: { inputs: [], outputs: [] } };
}

/** The build record as far as a subflow trial reads it: the plan in force. */
const RECORD = { record: { plans: [{ plan: { digest: "plan.1" } }], taskSpecs: [] } } as unknown as Awaited<ReturnType<Parameters<typeof automationStudioProjectBuildSubflowTrials>[0]["records"]["read"]>>;
const binding = { domainId: "test", deniedEvidenceKeys: [], tools: [], executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: {} }), runsNodes: { arrival: ARRIVAL } } as unknown as AutomationStudioLlmEvidenceRuntimeBinding;
const yes = () => mockProvider(async () => judgeReply("yes"));
const nothingDiffers = async (): Promise<AutomationStudioSiteResetComparison> => ({ moved: true, differs: [] });

describe("every phase of a project build starts from the build's one start", () => {
  it("refuses unwitnessed entry preparation before its start hook", async () => {
    const run = site({ hook: true });
    for (const subflow of run.f.findProposal.subflows) {
      for (const node of subflow.nodes) delete node.resetWitness;
    }
    // Replace the kept passing proposal with the unstamped one, as an old proposal may arrive.
    run.proposals.trialled(scopeOf("find", "brief.find", []), run.f.findProposal, "yes");
    const started = await run.start.explore({ phase: "builder", scope: scopeOf("add", "brief.add", ["find"]), own: run.ledger.forBrief("brief.add"), signal: new AbortController().signal, openingArrives: true });
    expect(started.entry).toMatchObject({ kind: "unprepared", code: "candidate.trial_step_unwitnessed" });
    expect(run.state.hooks).toBe(0);
    expect(run.state.ran).toEqual([]);
  });
  const explored = [
    { phase: "builder" as const, predecessors: [] as string[] },
    { phase: "builder" as const, predecessors: ["find"] },
    { phase: "repair" as const, predecessors: ["find"] },
    { phase: "reset" as const, predecessors: [] as string[] }
  ];
  for (const hook of [true, false]) {
    for (const { phase, predecessors } of explored) {
      it(`a ${phase}${predecessors.length ? " after a predecessor" : ""} ${hook ? "with" : "with no"} start hook`, async () => {
        const run = site({ hook });
        const own = run.ledger.forBrief("brief.add");
        const started = await run.start.explore({ phase, scope: scopeOf("add", "brief.add", predecessors), own, signal: new AbortController().signal, openingArrives: true });
        const { told } = started;
        // (a)
        expect(run.state.hooks).toBe(hook ? 1 : 0);
        expect(told).toMatchObject({ phase, startHook: hook ? "ran" : "none" });
        // (b)
        const act1 = run.ledger.snapshot().acts.find((act) => act.act === "act-1")!;
        if (hook) {
          expect(told.putBack).toEqual(["act-1"]);
          expect(told).not.toHaveProperty("stillOnSite");
          expect(told).not.toHaveProperty("possiblyOnSite");
          expect(act1.inPlace).toBe(false);
          expect(run.ledger.forBrief("brief.earlier").possiblyInPlace()).toEqual([]);
        } else {
          expect(told).not.toHaveProperty("putBack");
          expect(told.stillOnSite).toEqual([{ act: "act-1", did: "press \"Add\" button" }]);
          expect(told.possiblyOnSite).toEqual([{ act: "act-2", did: `press "Add" button ${POSSIBLY}` }]);
          expect(act1.inPlace).toBe(true);
          expect(String(told.note)).toContain(phase === "reset" ? "they are what this reset undoes: act-1" : "so it is not as the build found it: act-1");
        }
        // (c) and (d)
        if (predecessors.length && !hook) {
          expect(started.entry).toMatchObject({ kind: "unprepared", code: "project.entry_site_not_reset" });
          expect(run.state.ran).toEqual([]);
          expect(own.inPlace()).toEqual([]);
        } else if (predecessors.length) {
          expect(told, JSON.stringify(started.record)).toMatchObject({ arrival: "loaded", predecessors: { ran: ["find"], prepared: true }, standsOn: "where \"find\" leave the site" });
          // Loaded first, after the hook, though the tab showed another page; then the predecessor, from there.
          expect(run.state.ran).toEqual([...(hook ? ["hook"] : []), `go ${START}`, `${PRESS.id} on ${START}`]);
          // The predecessor's act is the entry's: it goes into this phase's own ledger, to be undone before its trial.
          expect(own.inPlace()).toEqual([expect.objectContaining({ did: expect.stringContaining("trial step") })]);
        } else {
          expect(told).toMatchObject({ arrival: "opening", standsOn: `the build's start location (${START})` });
          expect(told).not.toHaveProperty("predecessors");
          expect(run.state.ran).toEqual(hook ? ["hook"] : []);
        }
        // (e)
        expect(started.record).toMatchObject({ phase, hook: hook ? "ran" : "none" });
        expect(String(told.note)).toContain(hook ? "the deployment's start hook ran" : "no start hook");
      });
    }

    it(`a builder's subflow trial after a predecessor ${hook ? "with" : "with no"} start hook`, async () => {
      const run = site({ hook });
      const scope = scopeOf("add", "brief.add", ["find"]);
      const proposal: AutomationStudioSubflowProposal = { ...run.f.request().proposal, scope: { buildId: "build.1", briefId: "brief.add", planDigest: "plan.1", subflowKey: "add" } };
      stampParts(run.ledger, proposal.subflows);
      const trials = automationStudioProjectBuildSubflowTrials({
        ref: { projectId: "project", flowId: "parent", buildId: "build.1" }, environment: run.environment, binding, judge: { provider: yes() },
        records: { read: async () => RECORD }, proposals: run.proposals, leases: { assertCurrent: () => undefined }, running: () => true
      });
      const own = run.ledger.forBrief("brief.add");
      // The builder's gate holds the build's one reset (`./brief-ports.ts`).
      const gate = new AutomationStudioSubflowTrialGate({ scope, latest: () => structuredClone(proposal), port: trials.port, reset: run.start.reset(own, () => ({ compare: nothingDiffers, compareAt: nothingDiffers })) });
      const leases = new AutomationStudioHostLeaseScope(new AutomationStudioHostResourceScheduler(new StubHost({ capacity: 1 })));
      const test = async () => (await leases.run({ role: "subflow_builder", briefId: "brief.add" }, async () => await gate.test({ revision: proposal.revision, digest: proposal.digest }))).evidence as JsonObject;
      const evidence = await test();
      // (b) without a hook: the trial runs with this build's act on the site, said under startedWith (t775).
      if (!hook) expect(((evidence.startedWith as JsonObject).acts as JsonObject[]).map((act) => act.act)).toEqual(["act-1"]);
      expect(evidence, JSON.stringify(evidence)).toMatchObject({ verdict: "yes", entryPrepared: true });
      // (a) and (b)
      expect(run.state.hooks).toBe(hook ? 1 : 0);
      if (hook) expect((evidence.absorbedByStartReset as JsonObject[]).map((act) => act.act)).toEqual(["act-1"]);
      else expect(evidence).not.toHaveProperty("absorbedByStartReset");
      // (c) and (d): loaded first, on a stale tab, then the predecessor, then the subflow itself.
      expect(run.state.ran).toEqual([...(hook ? ["hook"] : []), `go ${START}`, `${PRESS.id} on ${START}`, `${PRESS.id} on ${START}`]);
      // (e)
      expect((evidence.feedback as JsonObject).phaseStart).toMatchObject({ phase: "subflow_trial", startHook: hook ? "ran" : "none", arrival: "loaded", predecessors: { ran: ["find"], prepared: true }, standsOn: "where \"find\" leave the site" });
    });

    it(`the whole trial of the assembled Flow ${hook ? "with" : "with no"} start hook`, async () => {
      const run = site({ hook });
      const candidate = assembled(run.registry, run.f.ports.resolution, run.ledger);
      const trials = automationStudioProjectBuildWholeTrials({ candidateId: "candidate.1", environment: run.environment, binding, judge: { provider: yes(), instructions: [] }, ledger: run.ledger });
      // The build's one reset as the supervisor asks it with no look (`project-agents/supervisor/whole-trial.ts`): no brief of its own.
      const reset = run.start.reset(undefined, () => ({ compare: async () => ({ moved: false }) }));
      const gate = new AutomationStudioFlowCandidateTrialGate({ latest: () => structuredClone(candidate), trial: { candidateId: "candidate.1", port: trials.port }, reset });
      const test = async () => (await gate.test({ revision: candidate.revision, digest: candidate.digest })).evidence as JsonObject;
      const evidence = await test();
      // Without a hook the whole trial runs with this build's act on the site, said under startedWith (t775): no reset brief.
      if (!hook) expect(((evidence.startedWith as JsonObject).acts as JsonObject[]).map((act) => act.act)).toEqual(["act-1"]);
      expect(evidence, JSON.stringify(evidence)).toMatchObject({ verdict: "yes" });
      // (a) and (b)
      expect(run.state.hooks).toBe(hook ? 1 : 0);
      if (hook) expect((evidence.absorbedByStartReset as JsonObject[]).map((act) => act.act)).toEqual(["act-1"]);
      // (c): the assembled Flow's first step loads the start location, though the tab showed another page; then its calls.
      expect(candidate.buildPlan.plan.subflows[0]!.nodes[0]).toMatchObject({ key: "arrival", definitionId: GO.id, parameters: { location: START } });
      expect(run.state.ran).toEqual([...(hook ? ["hook"] : []), `go ${START}`, `${PRESS.id} on ${START}`, `${PRESS.id} on ${START}`]);
      // (b): after a hook the build's earlier act counts undone; without one nothing undoes it, so it is still on the site, as the trial was told (t775).
      expect(run.ledger.snapshot().acts.find((act) => act.act === "act-1")).toMatchObject({ inPlace: !hook });
      // (e); it begins after nothing, so it names no predecessors.
      const told = (evidence.feedback as JsonObject).phaseStart as JsonObject;
      expect(told).toMatchObject({ phase: "whole_trial", startHook: hook ? "ran" : "none", arrival: "loaded", standsOn: `the build's start location (${START})` });
      expect(told).not.toHaveProperty("predecessors");
    });
  }
});

// t775 D5 (user, 2026-10-27): a trial is judged against the state recorded just before it and the change asked for; a
// line at 9 that is 10 after "add 1" passed, with no reset. The supervisor's judged whole run is that example, and takes
// its readings through Core's own look (`../phase-start.ts`, `look`): a start check over the build's registry binding,
// outside any loop, each read handed to every ledger that holds an act. Here the build's earlier add left the list's row
// at 9, a trial since made that read stale, and each press of the whole run adds one.
describe("the judged whole run, read through Core's own look (t775 D5)", () => {
  const LIST = "https://site.test/list";
  const ADDS = { kind: "change" as const, direction: "adds" as const, count: 1, what: "item on the list" };

  function reading(run: ReturnType<typeof site>) {
    const rows: Record<string, string> = { "s:item": "v:count-9" };
    const arrivals: string[] = [];
    const starts: JsonObject[] = [];
    const judged: unknown[] = [];
    /** The list page as the domain reads it, its lines worded against `start` when given. */
    const read = (start?: JsonObject) => ({
      state: { rows: { ...rows } }, differs: [], location: LIST, resource: "r:phase", scope: "p:phase-page",
      collections: [{ scope: "p:phase", group: "g:phase", subjects: Object.keys(rows), states: { ...rows } }],
      ...(start ? { lines: { gone: ["Item: 9 on the list"], added: [`Item: ${rows["s:item"] === "v:count-9" ? 9 : 10} on the list`] } } : {})
    });
    const bound = {
      ...binding,
      startState: async (input: { start?: JsonObject }) => {
        if (input.start) starts.push(input.start);
        return read(input.start);
      },
      executeTool: async (call: { toolId: string; value: JsonObject }) => {
        if (call.toolId === "core.run_node") arrivals.push(String((call.value.parameters as JsonObject).location));
        return { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true };
      }
    } as unknown as AutomationStudioLlmEvidenceRuntimeBinding;
    // Each press the whole run makes adds one to the row.
    const environment: AutomationStudioProjectBuildTrialEnvironment = {
      ...run.environment,
      graphOptions: (input) => {
        const options = run.environment.graphOptions(input);
        return { ...options, nativeNodeExecutor: async (call) => {
          if (call.node.definitionId === PRESS.id) rows["s:item"] = "v:count-10";
          return await options.nativeNodeExecutor!(call);
        } };
      }
    };
    const provider = mockProvider(async (request) => (judged.push(request), judgeReply("yes")));
    return { rows, arrivals, starts, judged, read, bound, environment, provider };
  }

  it("reads the row at 9 just before and 10 after, with no reset, and its judge is sent the change with the part shown", async () => {
    const run = site({ hook: false });
    const site_ = reading(run);
    const candidate = assembled(run.registry, run.f.ports.resolution, run.ledger);
    // The list was read at 9 after the build's earlier add; a trial since made that read stale.
    for (const owner of new Set(run.ledger.snapshot().acts.map((act) => act.owner))) run.ledger.forBrief(owner).observed(site_.read(), false);
    run.ledger.forBrief("brief.earlier").trialRan([], "trial.earlier");
    const look = AutomationStudioProjectBuildPhaseStart.look({ binding: site_.bound, environment: run.environment, ledger: run.ledger, liveCheck: { settleMs: 0 } });
    expect(look).toBeDefined();
    const trials = automationStudioProjectBuildWholeTrials({ candidateId: "candidate.1", environment: site_.environment, binding: site_.bound, judge: { provider: site_.provider, instructions: [] }, ledger: run.ledger });
    // The supervisor's reset as `project-agents/supervisor/whole-trial.ts` makes it: no brief of its own, never back to the start, Core's own look.
    const reset = run.start.reset(undefined, (signal) => ({ compare: async () => ({ moved: false }), lookAt: look!(signal) }));
    const partsOf: Record<string, string[]> = { main: [], find: ["p1"], add: ["p1"] };
    const gate = new AutomationStudioFlowCandidateTrialGate({
      latest: () => structuredClone(candidate), trial: { candidateId: "candidate.1", port: trials.port }, reset,
      changeParts: () => ({ parts: [{ id: "p1", effect: ADDS }], partsOf: (key) => partsOf[key ?? ""] ?? [] })
    });
    const evidence = (await gate.test({ revision: candidate.revision, digest: candidate.digest })).evidence as JsonObject;
    // No reset: the trial ran with the build's add on the site, said under startedWith.
    expect(evidence, JSON.stringify(evidence)).toMatchObject({ verdict: "yes" });
    expect(((evidence.startedWith as JsonObject).acts as JsonObject[]).map((act) => act.act)).toEqual(["act-1"]);
    expect(run.ledger.snapshot().acts.find((act) => act.act === "act-1")).toMatchObject({ inPlace: true });
    // Core looked at the list itself just before the run (its read was stale) and again after it, worded against the before state.
    expect(site_.arrivals).toEqual([LIST, LIST]);
    expect(site_.starts).toContainEqual({ rows: { "s:item": "v:count-9" } });
    // The judge (its yes and the yes's recheck) was sent the change: the row read at 9 by Core's look, 10 after, the part's adds shown.
    expect(site_.judged).toHaveLength(2);
    for (const request of site_.judged) {
      expect(keyed(request, "siteChange")).toEqual({
        witnesses: [{
          id: "w1", kind: "list", where: LIST, steps: [4, 7], parts: ["p1"],
          before: { source: "core_look", rows: 1 }, after: { source: "core_look", rows: 1 },
          change: { added: 0, removed: 0, changed: 1, unchanged: 0, lines: { gone: ["Item: 9 on the list"], added: ["Item: 10 on the list"] } }
        }],
        acts: [{ step: 4, outcome: "changed", witness: "w1", parts: ["p1"] }, { step: 7, outcome: "changed", witness: "w1", parts: ["p1"] }],
        leftFromEarlier: [{ did: "press \"Add\" button" }],
        proofs: [{ part: "p1", effect: ADDS, proof: "shown", steps: [4, 7] }]
      });
    }
  });

  it("is no look where no run Core makes arrives at the build's start location, or the domain cannot read its state", () => {
    const run = site({ hook: false });
    const site_ = reading(run);
    const { startLocation: _startLocation, ...unlocated } = run.environment;
    expect(AutomationStudioProjectBuildPhaseStart.look({ binding: site_.bound, environment: unlocated, ledger: run.ledger })).toBeUndefined();
    expect(AutomationStudioProjectBuildPhaseStart.look({ binding: { ...site_.bound, runsNodes: {} }, environment: run.environment, ledger: run.ledger })).toBeUndefined();
    const { startState: _startState, ...unread } = site_.bound;
    expect(AutomationStudioProjectBuildPhaseStart.look({ binding: unread, environment: run.environment, ledger: run.ledger })).toBeUndefined();
  });
});

describe("what a phase is told of possibly lasting presses", () => {
  it("names only the latest ten, and counts the rest", () => {
    const presses = Array.from({ length: 13 }, (_, index) => ({ act: `act-${index + 1}`, did: `press ${index + 1}`, possible: true as const }));
    const told = automationStudioProjectBuildPhaseStartTold({ phase: "builder", hook: "none", possiblyOnSite: presses, arrival: "opening" });
    expect((told.possiblyOnSite as JsonObject[]).map((act) => act.act)).toEqual(presses.slice(3).map((act) => act.act));
    expect(told.possiblyOnSiteLeftOut).toBe(3);
    expect(String(told.note)).toContain("act-13, and 3 earlier.");
  });
});

// t743 (S2): an act no call can settle -- a press on a control in no list any
// read showed, so nothing can be named for it -- is never among the acts in
// place, yet it is still on the site. A phase is told it apart, as one not to
// undo, with no trial able to run while it is there.
describe("what a phase is told of an act no call can settle", () => {
  it("names it under actsUnsettleable and in its note, never among the acts this reset undoes", async () => {
    const ledger = new AutomationStudioSiteResetProjectLedger();
    ledger.forBrief("brief.earlier").explored({ callId: "mark", toolId: "core.run_node", landed: true, declared: { permitted: true, effect: "mutate", consequences: ["modify_existing"], control: { name: "Mark", kind: "button", subject: "s:mark" }, verb: "press" } });
    expect(ledger.unsatisfiable().map((act) => act.act)).toEqual(["act-1"]);
    const start = new AutomationStudioProjectBuildPhaseStart({ environment: {} as AutomationStudioProjectBuildTrialEnvironment, arrival: undefined, ledger, proposals: new AutomationStudioProjectBuildProposals() });
    expect(start.onSite()).toMatchObject({ still: [], unsettleable: [{ act: "act-1", did: "press \"Mark\" button" }] });
    const started = await start.explore({ phase: "reset", scope: scopeOf("reset", "brief.reset", []), own: ledger.forBrief("brief.reset"), signal: new AbortController().signal, openingArrives: false });
    expect(started.told).toMatchObject({ actsUnsettleable: [{ act: "act-1", did: "press \"Mark\" button" }] });
    expect(started.told).not.toHaveProperty("stillOnSite");
    expect(String(started.told.note)).toContain("These acts of this build are still on the site, and nothing can check or put them back, so do not try to undo them; no trial can run while they are there: act-1.");
  });
});

/** The Flow a project build assembles from the two subflows' proposals: the router-run subflow's arrival, then a call to each (`project-agents/supervisor/assembly.ts`). */
function assembled(registry: AutomationStudioNodeRegistry, resolution: Parameters<typeof validateAutomationStudioFlowBootstrapPlan>[0]["resolution"], ledger: AutomationStudioSiteResetProjectLedger): AutomationStudioFlowCandidate {
  const spec = { parts: [{ id: "p1", quote: { sourceId: "s", text: "x" }, goalFacts: [], lastingActs: [] }], notAsked: [] };
  const taskSpecDigest = automationStudioProjectTaskSpec.digest(spec);
  const main = { key: "main", name: "Main", role: "primary" as const, nodes: [], edges: [] };
  const find = part("find", "utility");
  const add = part("add", "utility");
  stampParts(ledger, [find, add]);
  const plan = { schemaVersion: "0.1" as const, router: { name: "R", rules: [], fallback: { kind: "subflow" as const, targetSubflowKey: "main" } }, subflows: [main, find, add] };
  const partOf = { main: [], find: ["p1"], add: ["p1"] };
  const structure = { taskSpecDigest, plan, partOf, digest: automationStudioProjectStructurePlan.digest({ taskSpecDigest, plan, partOf }) };
  const proposalOf = (subflow: typeof find): AutomationStudioSubflowProposal => ({ scope: { buildId: "build.1", briefId: `brief.${subflow.key}`, planDigest: structure.digest, subflowKey: subflow.key }, revision: 1, digest: `${subflow.key}.1`, subflows: [subflow], summary: subflow.key, changedPaths: [] });
  const arrival = automationStudioArrivalPlanNode({ ...ARRIVAL, location: START }, registry, resolution);
  const result = automationStudioProjectAssembly({ structure, proposals: new Map([["find", proposalOf(find)], ["add", proposalOf(add)]]), predecessors: new Map([["add", ["find"]]]), arrival });
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  const validation = validateAutomationStudioFlowBootstrapPlan({ plan: result.assembled.plan, registry, resolution });
  if (!validation.ok || !validation.validated) throw new Error(JSON.stringify(validation.issues));
  return { revision: 1, digest: "whole.1", baseDependencyDigest: "base", status: "draft", summary: "assembled", buildPlan: validation.validated, changedPaths: [] };
}

/** The first value under `key` anywhere in `value`, depth first: where a judge request carries the trial's summary. */
function keyed(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object") return undefined;
  if (!Array.isArray(value) && key in value) return (value as Record<string, unknown>)[key];
  return Object.values(value).map((entry) => keyed(entry, key)).find((found) => found !== undefined);
}
