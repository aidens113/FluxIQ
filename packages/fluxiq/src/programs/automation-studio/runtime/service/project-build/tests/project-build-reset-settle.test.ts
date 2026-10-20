// L1 reset settlement through the brief ports themselves (`../brief-ports.ts`):
// Core looks at a place itself before it asks a model, and a reset's task says
// what settles each act still open.
//
// One generic reading-list site, opaque tokens only. A builder added an item
// and removed it again, with nothing read after the removal, so its act's
// witness is stale; another brief pressed a control in no item; a trial's step
// made an act no list shows. A reset brief's ports, made, have already looked
// at the list once themselves (settle first): that read reached every ledger
// (the builder's, the other brief's and the reset's own), the removed item's
// act settled with no model decision, and the task lists only the two acts
// still open: the press "page not read", the trial's act by its step, each
// with what settles it where its ledger says. A builder's trial reset looks the
// same way.
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
import type { AutomationStudioProjectBriefPortRequest } from "../../../project-agents/index.ts";
import { automationStudioProjectBuildBriefPorts } from "../brief-ports.ts";

const site = vi.hoisted(() => ({
  /** Where the tab stands, and the list's rows. */
  at: "loc:start",
  rows: [] as string[],
  /** Every location Core's own looks went to. */
  looked: [] as string[],
  tools: [] as unknown[]
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
      executeTool: async (call: { value: JsonObject }) => {
        if (call.value.node === GO) {
          site.at = String((call.value.parameters as JsonObject).to);
          site.looked.push(site.at);
        }
        return { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: false };
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
const page = (rows: readonly string[]): AutomationStudioSiteResetRead => ({ state: {}, differs: [], resource: SITE, scope: "p:list-page", location: "loc:list", collections: [list(rows)] });
const press = (callId: string, consequences: AutomationStudioActionConsequence[], control: AutomationStudioSiteResetSpot & { name: string }, extra: Partial<AutomationStudioSiteResetExplored> = {}): AutomationStudioSiteResetExplored => {
  const { name, ...tokens } = control;
  return { callId, toolId: "core.run_node", landed: true, declared: { permitted: true, effect: "mutate", consequences, control: { name, kind: "button", ...tokens }, verb: "press" }, ...extra };
};

afterEach(() => vi.restoreAllMocks());

/** The build (header): act-1 added and removed with nothing read after, act-2 a press in no item, act-3 a trial's step. */
function built() {
  Object.assign(site, { at: "loc:start", rows: [...ORIGINAL], looked: [], tools: [RUN_NODE] });
  const project = new AutomationStudioSiteResetProjectLedger();
  const keep = project.forBrief("brief.keep");
  const other = project.forBrief("brief.other");
  project.observed(page(site.rows));
  keep.observed(page(site.rows));
  expect(keep.destinationReceipts().map((receipt) => receipt.ref)).toEqual(["destination-1"]);
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
  keep.trialRan([{ step: 2, definitionId: "demo.add", consequences: ["create_new"], spot: { subject: "s:extra" } }], "trial-run-1");
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
    const left = await ports.remainingActs!();
    expect(left.map((act) => act.act)).toEqual(["act-2", "act-3"]);
    expect(left.find((act) => act.act === "act-3")?.settle).toBe(run.keep.inPlace().find((act) => act.act === "act-3")?.settle);
  });

  it("tell the reset only the acts still open: a press with no page read, a trial's act by its step, each with what settles it", async () => {
    const run = built();
    await run.ports.reset(run.request("brief.reset", "reset"));
    const task = (await run.firstRequest()).instructions.find((instruction) => instruction.instructionId === "core.project_reset_task")!.body;
    const settle = run.keep.inPlace().find((act) => act.act === "act-3")!.settle!;
    expect(settle).toContain("Nothing read shows where its effect would be");
    expect(task).not.toContain("- act-1:");
    expect(task).toContain("- act-2: press \"Apply code\" button (by the build's call \"coupon\"), page not read\n");
    expect(task).toContain(`- act-3: trial step 2 demo.add (made by step 2 of a trial run). What settles it: ${settle}`);
    expect(task).not.toContain("act-3: trial step 2 demo.add, page not read");
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
