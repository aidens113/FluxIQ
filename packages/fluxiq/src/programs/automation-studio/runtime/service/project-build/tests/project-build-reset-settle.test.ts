// L1 reset settlement through the brief ports themselves (`../brief-ports.ts`):
// Core looks at a place itself before it asks a model, and a reset's task says
// what settles each act still open.
//
// One generic reading-list site, opaque tokens only. A builder added an item
// and removed it again, with nothing read after the removal, so its act's
// witness is stale; another brief pressed a control in no item; a trial's step
// made a stamped act whose list currently shows no change. A reset brief's ports have already looked
// at the list once themselves (settle first): that read reached every ledger
// (the builder's, the other brief's and the reset's own), the removed item's
// act settled with no model decision, and so did the trial's stamped act.
// An unrelated changed list on the same page is never adopted as a witness
// and does not keep that act open. A builder's trial reset looks the same way.
//
// The phase start (`../phase-start.ts`) is replaced by its own reset alone, and
// the harness options by one run-node tool over the stub site: what is under
// test is the ports' wiring, not the start or the harness.

import { afterEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioActionConsequence } from "../../../action-permissions/index.ts";
import {
  AutomationStudioSiteResetLedger,
  AutomationStudioSiteResetProjectLedger,
  type AutomationStudioSiteResetChecks,
  type AutomationStudioSiteResetExplored,
  type AutomationStudioSiteResetRead,
  type AutomationStudioSiteResetSpot
} from "../../../flow-bootstrap/site-reset/index.ts";
import type { AutomationStudioLlmEvidenceTool, AutomationStudioLlmHarnessInput } from "../../../llm/index.ts";
import { runAutomationStudioSubflowBuilderLoop } from "../../../flow-bootstrap/subflow-candidate/index.ts";
import type { AutomationStudioProjectBriefPortRequest } from "../../../project-agents/index.ts";
import { gardenBrief, gardenBuild } from "../../../project-agents/dispatch/tests/dispatch-fixture.ts";
import { automationStudioProjectBuildBriefPorts } from "../brief-ports.ts";

const site = vi.hoisted(() => ({
  /** Where the tab stands, and the list's rows. */
  at: "loc:start",
  rows: [] as string[],
  /** Every location Core's own looks went to. */
  looked: [] as string[],
  tools: [] as unknown[],
  /** A second, independent list on the same page, when a test reads one. */
  shelf: undefined as string[] | undefined,
  /** Every call the stub site was sent, by its call id. */
  sent: [] as Array<{ callId: string; value: Record<string, unknown> }>
}));

// Both reads of a settled read back to back (`settle-ms.ts`).
vi.mock("../../../flow-bootstrap/site-reset/index.ts", async (original) => ({ ...(await original<object>()), AUTOMATION_STUDIO_SITE_RESET_SETTLE_MS: 0 }));
// The harness options: one run-node tool over the stub site (header).
vi.mock("../../../llm/index.ts", async (original) => ({
  ...(await original<object>()),
  automationStudioLlmNodeDescriptions: () => ({ ids: () => [], definition: () => undefined }),
  automationStudioHarnessOptionRegistry: () => ({
    evidenceLoopBinding: () => ({
      tools: site.tools,
      observedStateKeys: [],
      executeTool: async (call: { callId: string; value: JsonObject }) => {
        site.sent.push({ callId: call.callId, value: structuredClone(call.value) });
        if (call.value.node === GO) {
          site.at = String((call.value.parameters as JsonObject).to);
          site.looked.push(site.at);
        }
        return { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: call.value.node === GO };
      }
    })
  })
}));
// The phase start: its reset over the project ledger, and a start that changes nothing (header).
vi.mock("../phase-start.ts", async () => {
  const reset = await import("../../../flow-bootstrap/site-reset/index.ts");
  class PhaseStart {
    constructor(private readonly input: { ledger: AutomationStudioSiteResetProjectLedger }) {}
    reset(own: AutomationStudioSiteResetLedger | undefined, checks: (signal: AbortSignal | undefined) => AutomationStudioSiteResetChecks) {
      return reset.automationStudioSiteResetProjectReset({ project: this.input.ledger, ...(own ? { own } : {}), checks });
    }
    async explore() {
      return { record: {}, entry: { kind: "start" }, told: undefined };
    }
  }
  return { AutomationStudioProjectBuildPhaseStart: PhaseStart };
});

const GO = "example.go";
const RUN_NODE: AutomationStudioLlmEvidenceTool = { toolId: "core.run_node", description: "Run a node", effect: "mutate", perCallEffect: true, inputSchema: { type: "object", properties: { node: { type: "string" }, parameters: { type: "object" }, consequences: { type: "array" } } }, initialObservation: { input: { node: "example.look", parameters: {}, consequences: [] } } } as AutomationStudioLlmEvidenceTool;
const SITE = "r:site";
const ORIGINAL = ["s:one", "s:two"];
const list = (rows: readonly string[]) => ({ scope: "p:items", group: "g:items", subjects: [...rows], states: Object.fromEntries(rows.map((row) => [row, `v:${row}`])) });
const shelf = (rows: readonly string[]) => ({ scope: "p:shelf", group: "g:shelf", subjects: [...rows], states: Object.fromEntries(rows.map((row) => [row, `v:${row}`])) });
const page = (rows: readonly string[]): AutomationStudioSiteResetRead => ({ state: {}, differs: [], resource: SITE, scope: "p:list-page", location: "loc:list", collections: [list(rows), ...(site.shelf ? [shelf(site.shelf)] : [])] });
const press = (callId: string, consequences: AutomationStudioActionConsequence[], control: AutomationStudioSiteResetSpot & { name: string }, extra: Partial<AutomationStudioSiteResetExplored> = {}): AutomationStudioSiteResetExplored => {
  const { name, ...tokens } = control;
  return { callId, toolId: "core.run_node", landed: true, declared: { permitted: true, effect: "mutate", consequences, control: { name, kind: "button", ...tokens }, verb: "press" }, ...extra };
};

afterEach(() => vi.restoreAllMocks());

/**
 * The build (header): act-1 added and removed with nothing read after, act-2 a press in no item, act-3 a trial's step.
 * With `shelfMoved`, the page also holds a second list, read before the build acted, that has changed by the reset.
 */
function built(options: { shelfMoved?: boolean } = {}) {
  Object.assign(site, { at: "loc:start", rows: [...ORIGINAL], looked: [], tools: [RUN_NODE], shelf: options.shelfMoved ? ["s:shelf-one"] : undefined, sent: [] });
  const project = new AutomationStudioSiteResetProjectLedger();
  const keep = project.forBrief("brief.keep");
  const other = project.forBrief("brief.other");
  project.observed(page(site.rows));
  keep.observed(page(site.rows));
  expect(keep.destinationReceipts().map((receipt) => receipt.ref)).toEqual(options.shelfMoved ? ["destination-1", "destination-2"] : ["destination-1"]);
  const created = { name: "Add", subject: "s:new", page: "s:new", resource: SITE };
  expect(keep.createBaseline({ effect: "mutate", consequences: ["create_new"], control: { ...created, kind: "button" } }, "destination-1")).toEqual({ kind: "admit" });
  keep.explored(press("add", ["create_new"], created, { resetDestination: "destination-1" }));
  site.rows.push("s:new");
  keep.observed(page(site.rows));
  const row = { scope: "p:items", subject: "s:new", item: "i:new", resource: SITE };
  expect(keep.target("act-1", { effect: "mutate", consequences: ["delete"], control: row })).toMatchObject({ kind: "admit" });
  keep.explored(press("remove", ["delete"], { name: "Remove", ...row }, { undoes: "act-1", on: "subject" }));
  site.rows.splice(site.rows.indexOf("s:new"), 1);
  other.explored(press("coupon", ["modify_existing"], { name: "Apply code" }));
  const witness = keep.admitStep({ effect: "mutate", consequences: ["create_new"], control: { name: "Add", kind: "button", subject: "s:extra", scope: "p:items", resource: SITE } });
  expect(witness).toEqual({ via: "destination", ref: "destination-1" });
  if (!witness) throw new Error("fixture step needs a witnessed original");
  keep.trialRan([{ step: 2, definitionId: "demo.add", consequences: ["create_new"], witness, spot: { subject: "s:extra" }, controls: { page: "p:list-page", location: "loc:list", before: {}, after: {} } }], "trial-run-1");
  if (site.shelf) site.shelf.push("s:shelf-moved");
  /** Every request the model was sent, and the decision function the ports built. */
  const sent: AutomationStudioLlmHarnessInput[] = [];
  let runHarness: ((call: AutomationStudioLlmHarnessInput) => Promise<unknown>) | undefined;
  const binding = {
    domainId: "example", deniedEvidenceKeys: [], tools: [RUN_NODE], executeTool: async () => ({}),
    runsNodes: { arrival: { node: GO, parameter: "to" } },
    startState: async () => (site.at === "loc:list" ? page(site.rows) : { state: {}, differs: [], resource: SITE, scope: "p:start", location: site.at })
  };
  const ports = automationStudioProjectBuildBriefPorts({
    project: {
      ledger: project, binding, hostRuntime: undefined, flowInputs: [], cancellation: { tool: (execute: unknown) => execute },
      permissions: { permittedConsequences: [], instructionIds: [] }, personAsk: undefined, trialEnvironment: {},
      runHarness: async (call: AutomationStudioLlmHarnessInput) => {
        sent.push(call);
        return {};
      }
    },
    draft: { submission: { projectId: "project", flowId: "flow", resolution: {}, instructionText: "", originalSource: "", signal: new AbortController().signal }, loop: {}, maxConsecutiveUnusableDecisions: 3 },
    decisions: { decide: (input: { runHarness: typeof runHarness }) => {
      runHarness = input.runHarness;
      return async () => ({ kind: "complete", result: {} });
    } },
    subflowTrial: {}, proposals: {}, accounting: () => ({}), acts: { calls: (calls: unknown) => calls, trialRan: () => undefined }
  } as unknown as Parameters<typeof automationStudioProjectBuildBriefPorts>[0]);
  const request = (briefId: string, kind: "build" | "reset"): AutomationStudioProjectBriefPortRequest => ({
    brief: { briefId, kind, subflowKey: "keep", parts: [], permittedActs: [], maxIterations: 4 },
    scope: { buildId: "build.1", briefId, planDigest: "plan.1", subflowKey: "keep", predecessors: [], parts: [], interface: { inputs: [], outputs: [] } },
    ledger: project.forBrief(briefId), lease: {}, signal: new AbortController().signal
  } as unknown as AutomationStudioProjectBriefPortRequest);
  /** The model's first request, made now: its instructions are what the reset is told. */
  const firstRequest = async () => {
    await runHarness!({ instructions: [], evidenceLoop: { iteration: 1, tools: [], evidence: [], decisionSchema: {}, completionSchema: {}, canComplete: true }, flowBootstrap: {} } as unknown as AutomationStudioLlmHarnessInput);
    return sent.at(-1)!;
  };
  return { project, keep, other, ports, request, sent, firstRequest };
}

/** The ledgers a read at `location` reached, as `observed` was called on each. */
function reachedBy(spy: { mock: { calls: unknown[][]; contexts: unknown[] } }, location: string): Set<unknown> {
  return new Set(spy.mock.calls.flatMap((call, index) => ((call[0] as AutomationStudioSiteResetRead).location === location ? [spy.mock.contexts[index]] : [])));
}

describe("a reset brief's ports settle first", () => {
  it("look at the stale list once themselves, the read reaching every ledger, and settle the removed item's act with no model decision", async () => {
    const run = built();
    const observed = vi.spyOn(AutomationStudioSiteResetLedger.prototype, "observed");
    const own = run.project.forBrief("brief.reset");
    expect(run.keep.standing("act-1")).toBe("in_place");
    const ports = await run.ports.reset(run.request("brief.reset", "reset"));

    expect(site.looked).toEqual(["loc:list"]);
    const reached = reachedBy(observed, "loc:list");
    for (const ledger of [run.keep, run.other, own]) expect(reached.has(ledger)).toBe(true);
    expect(run.keep.standing("act-1")).toBe("restored");
    // Settled before any decision: the model was sent nothing.
    expect(run.sent).toHaveLength(0);
    // The trial's stamped list is holding: settled before a model decision.
    expect(run.keep.standing("act-3")).toBe("unchanged");
    const left = await ports.remainingActs!();
    expect(left.map((act) => act.act)).toEqual(["act-2"]);
  });

  it("does not adopt an unrelated changed list for a stamped trial act", async () => {
    const run = built({ shelfMoved: true });
    await run.ports.reset(run.request("brief.reset", "reset"));
    const task = (await run.firstRequest()).instructions.find((instruction) => instruction.instructionId === "core.project_reset_task")!.body;
    expect(run.keep.standing("act-3")).toBe("unchanged");
    expect(task).not.toContain("- act-1:");
    expect(task).toContain("- act-2: press \"Apply code\" button (by the build's call \"coupon\"), page not read");
    expect(task).not.toContain("- act-3:");
    // What cannotUndo truly does.
    expect(task).toContain("name that act under `cannotUndo`, which reports it to the judge as an act the site cannot undo.");
    expect(task).toContain("`cannotUndo` never settles a reversible act whose watched state still differs: such an act stays listed with what settles it, and if the site truly cannot reverse it, complete with an honest unresolved summary naming it, and the build ends without a further trial.");
    expect(task).not.toContain("an ordinary trial still requires proved restoration");
  });
});

describe("a builder's trial reset", () => {
  it("looks at the stale list itself before refusing, and its read reaches every ledger", async () => {
    const run = built();
    const observed = vi.spyOn(AutomationStudioSiteResetLedger.prototype, "observed");
    const ports = await run.ports.builder(run.request("brief.keep", "build"));
    await ports.reset!.beforeTrial(new AbortController().signal);

    expect(site.looked).toEqual(["loc:list"]);
    const reached = reachedBy(observed, "loc:list");
    for (const ledger of [run.keep, run.other]) expect(reached.has(ledger)).toBe(true);
    expect(run.keep.standing("act-1")).toBe("restored");
  });
});

// t743 (office rerun round 4 `run-mvgvyaip-d856e135`): no location reached the
// dispatcher, so production put no places on a brief's opening call. A build's
// and a reset's ports now give the project ledger's issued refs, each with where
// its list was read, and the dispatcher puts those locations on the opening call.
describe("a brief's ports give the build's places", () => {
  it("each issued ref with where it was read, for a builder and a reset alike", async () => {
    const run = built();
    const builder = (await run.ports.builder(run.request("brief.keep", "build"))) as { issuedRefs?: () => unknown };
    const reset = (await run.ports.reset(run.request("brief.reset", "reset"))) as { issuedRefs?: () => unknown };
    expect(builder.issuedRefs?.()).toEqual([{ ref: "destination-1", count: 2, location: "loc:list" }]);
    expect(reset.issuedRefs?.()).toEqual([{ ref: "destination-1", count: 2, location: "loc:list" }]);
  });

  it("so a build brief's opening call carries them under places", async () => {
    const run = built();
    const build = await gardenBuild({ capacity: 1, briefs: [gardenBrief("b-build", "list_seeds")], ports: { builder: run.ports.builder } });
    build.dispatcherInput.runBuilder = runAutomationStudioSubflowBuilderLoop;
    await build.run();
    const opening = site.sent.find((entry) => entry.callId.startsWith("initial."));
    expect(opening?.value.places).toEqual(["loc:list"]);
    for (const entry of site.sent.filter((sent) => !sent.callId.startsWith("initial."))) expect(entry.value).not.toHaveProperty("places");
  });
});

// Rerun round 3 (office `run-mvgo5xft-25460ba2`, 0108-0119 and 0133-0136): a
// look that settled its act said nothing, a repeat was refused with an empty
// `actsToUndo` while other briefs' acts were open, and a look that named a ref
// with no act settled nothing silently. Brief A and brief B each pressed a
// control in no list read complete (explored acts, each open until a list is
// named for it); brief C, a reset, settles A's act with a look.
describe("what a look under undoes is answered, across briefs", () => {
  function twoBriefs() {
    Object.assign(site, { at: "loc:start", rows: [...ORIGINAL], looked: [], tools: [RUN_NODE] });
    // A fresh build: only the two presses, with the list read and its ref issued before them.
    const project = new AutomationStudioSiteResetProjectLedger();
    const first = project.forBrief("brief.a");
    const second = project.forBrief("brief.b");
    project.observed(page(site.rows));
    first.observed(page(site.rows));
    second.observed(page(site.rows));
    expect(first.destinationReceipts().map((receipt) => receipt.ref)).toEqual(["destination-1"]);
    first.explored(press("rate-a", ["modify_existing"], { name: "Rate", subject: "s:a", page: "s:a", resource: SITE }));
    second.explored(press("rate-b", ["modify_existing"], { name: "Rate", subject: "s:b", page: "s:b", resource: SITE }));
    return { project, first, second };
  }
  /** The reset loop's own tool call, as its ports run it. */
  type ResetToolCall = Parameters<Awaited<ReturnType<ReturnType<typeof automationStudioProjectBuildBriefPorts>["reset"]>>["loop"]["executeTool"]>[0];
  const look = (callId: string, extra: JsonObject): ResetToolCall => ({ callId, toolId: "core.run_node", value: { node: GO, parameters: { to: "loc:list" }, consequences: [], ...extra } });
  const evidenceOf = (ran: unknown): JsonObject => (ran as { evidence: JsonObject }).evidence;
  const portsFor = (project: AutomationStudioSiteResetProjectLedger) => {
    const binding = { domainId: "example", deniedEvidenceKeys: [], tools: [RUN_NODE], executeTool: async () => ({}), runsNodes: { arrival: { node: GO, parameter: "to" } }, startState: async () => (site.at === "loc:list" ? page(site.rows) : { state: {}, differs: [], resource: SITE, scope: "p:start", location: site.at }) };
    return automationStudioProjectBuildBriefPorts({
      project: { ledger: project, binding, hostRuntime: undefined, flowInputs: [], cancellation: { tool: (execute: unknown) => execute }, permissions: { permittedConsequences: [], instructionIds: [] }, personAsk: undefined, trialEnvironment: {}, runHarness: async () => ({}) },
      draft: { submission: { projectId: "project", flowId: "flow", resolution: {}, instructionText: "", originalSource: "", signal: new AbortController().signal }, loop: {}, maxConsecutiveUnusableDecisions: 3 },
      decisions: { decide: () => async () => ({ kind: "complete", result: {} }) },
      subflowTrial: {}, proposals: {}, accounting: () => ({}), acts: { calls: (calls: unknown) => calls, trialRan: () => undefined }
    } as unknown as Parameters<typeof automationStudioProjectBuildBriefPorts>[0]);
  };
  const resetRequest = (project: AutomationStudioSiteResetProjectLedger): AutomationStudioProjectBriefPortRequest => ({
    brief: { briefId: "brief.c", kind: "reset", subflowKey: "keep", parts: [], permittedActs: [], maxIterations: 4 },
    scope: { buildId: "build.1", briefId: "brief.c", planDigest: "plan.1", subflowKey: "keep", predecessors: [], parts: [], interface: { inputs: [], outputs: [] } },
    ledger: project.forBrief("brief.c"), lease: {}, signal: new AbortController().signal
  } as unknown as AutomationStudioProjectBriefPortRequest);

  it("names brief A's act settled and brief B's still open, and a repeat lists B's act", async () => {
    const { project, first, second } = twoBriefs();
    const ports = await portsFor(project).reset(resetRequest(project));
    expect(second.inPlace().map((act) => act.act)).toEqual(["act-2"]);
    const settling = evidenceOf(await ports.loop.executeTool(look("look-1", { undoes: "act-1", resetDestination: "destination-1" })));
    expect(first.standing("act-1")).toBe("unchanged");
    const said = settling.resetSettlement as JsonObject;
    expect(said.settled).toBe("act-1");
    const open = said.actsStillOpen as Array<{ act: string; settle?: string }>;
    expect(open.map((act) => act.act)).toEqual(["act-2"]);
    expect(open[0]!.settle).toContain("resetDestination");
    expect(String(said.instruction)).toContain("do not name it again");
    // The repeat: refused, and its actsToUndo is not empty.
    const repeat = evidenceOf(await ports.loop.executeTool(look("look-2", { undoes: "act-1", resetDestination: "destination-1" })));
    expect(repeat.code).toBe("candidate.undo_act_kept");
    expect((repeat.actsToUndo as Array<{ act: string }>).map((act) => act.act)).toEqual(["act-2"]);
    expect(repeat.resetSettlement).toBeUndefined();
  });

  it("says an act a look did not settle is still open, with its settle", async () => {
    const { project } = twoBriefs();
    const ports = await portsFor(project).reset(resetRequest(project));
    // A look naming the act with no ref leaves it as it was.
    const said = evidenceOf(await ports.loop.executeTool(look("look-1", { undoes: "act-2" }))).resetSettlement as JsonObject;
    expect(said.settled).toBeUndefined();
    expect(said.open).toBe("act-2");
    expect(String(said.settle)).toContain("resetDestination");
    expect((said.actsStillOpen as Array<{ act: string }>).map((act) => act.act)).toEqual(["act-1", "act-2"]);
  });

  it("notes that a look naming resetDestination with no undoes settled nothing, with an example from a real open act and an issued ref", async () => {
    const { project } = twoBriefs();
    const ports = await portsFor(project).reset(resetRequest(project));
    const evidence = evidenceOf(await ports.loop.executeTool(look("look-1", { resetDestination: "destination-1" })));
    const note = evidence.resetDestinationNote as JsonObject;
    expect(String(note.instruction)).toContain("settled nothing");
    expect((note.actsStillOpen as Array<{ act: string }>).map((act) => act.act)).toEqual(["act-1", "act-2"]);
    expect(note.example).toEqual({ undoes: "act-1", resetDestination: "destination-1" });
    expect(evidence.resetSettlement).toBeUndefined();
    // The ref the look named is listed among the reset's issued refs, for its completion's refusal.
    expect((ports as unknown as { issuedRefs(): Array<{ ref: string }> }).issuedRefs().map((entry) => entry.ref)).toContain("destination-1");
  });

  it("adds no note to a look with no resetDestination, nor once nothing is open", async () => {
    const { project } = twoBriefs();
    const ports = await portsFor(project).reset(resetRequest(project));
    expect(evidenceOf(await ports.loop.executeTool(look("look-1", {}))).resetDestinationNote).toBeUndefined();
    // Both acts settled by looks naming the list: a later look naming a ref with no act gets no note.
    await ports.loop.executeTool(look("look-2", { undoes: "act-1", resetDestination: "destination-1" }));
    await ports.loop.executeTool(look("look-3", { undoes: "act-2", resetDestination: "destination-1" }));
    expect(project.snapshot().acts.filter((act) => act.inPlace)).toEqual([]);
    expect(evidenceOf(await ports.loop.executeTool(look("look-4", { resetDestination: "destination-1" }))).resetDestinationNote).toBeUndefined();
  });
});
