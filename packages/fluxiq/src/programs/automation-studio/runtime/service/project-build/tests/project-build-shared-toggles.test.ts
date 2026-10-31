// t775 D2: one explored-toggle record per project build, shared by every brief
// of it (`../brief-ports.ts`). A press explored in one brief and answered as a
// toggle is what a step submitted in another brief of the same build is tied
// to; another project build starts with none.
//
// The phase start and the harness options are replaced as in
// `project-build-reset-settle.test.ts`: what is under test is the wiring.

import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioNodeRegistry, canonicalBuiltinAutomationNodeDefinitions, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import { AutomationStudioExploredToggles } from "../../../flow-bootstrap/index.ts";
import { AutomationStudioSiteResetProjectLedger } from "../../../flow-bootstrap/site-reset/index.ts";
import { AutomationStudioSubflowScopedSubmissionController, type AutomationStudioSubflowProposal, type AutomationStudioSubflowScope } from "../../../flow-bootstrap/subflow-candidate/index.ts";
import type { AutomationStudioLlmEvidenceTool } from "../../../llm/index.ts";
import type { AutomationStudioProjectBriefPortRequest } from "../../../project-agents/index.ts";
import { runAutomationStudioSubflowTrial } from "../../subflow-trial/index.ts";
import { subflowTrialFixture } from "../../subflow-trial/tests/fixtures.ts";
import { automationStudioProjectBuildBriefPorts } from "../brief-ports.ts";

const RUN_NODE: AutomationStudioLlmEvidenceTool = { toolId: "core.run_node", description: "Run a node", effect: "mutate", perCallEffect: true, inputSchema: { type: "object" } } as unknown as AutomationStudioLlmEvidenceTool;
const PRESS = { node: "domain.demo.press", parameters: { target: { handle: "t1" } }, consequences: [] };

vi.mock("../../../llm/index.ts", async (original) => ({
  ...(await original<object>()),
  automationStudioLlmNodeDescriptions: () => ({ ids: () => [], definition: () => undefined }),
  automationStudioHarnessOptionRegistry: () => ({
    evidenceLoopBinding: () => ({
      tools: [{ toolId: "core.run_node", description: "Run a node", effect: "mutate", perCallEffect: true, inputSchema: { type: "object" } }],
      observedStateKeys: [],
      executeTool: async () => ({
        kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true,
        outputs: { toggle: { signature: { state: "s.on" } } },
        draft: { actionId: "domain.demo.press", ranWith: { node: "domain.demo.press", parameters: { target: { selector: "#setting" } } } }
      })
    })
  })
}));
vi.mock("../phase-start.ts", async () => {
  class PhaseStart {
    reset() { return { beforeTrial: async () => ({}), trialRan: () => [] }; }
    async explore() { return { record: {}, entry: { kind: "start" }, told: undefined }; }
  }
  return { AutomationStudioProjectBuildPhaseStart: PhaseStart };
});

function factory() {
  const project = new AutomationStudioSiteResetProjectLedger();
  const binding = { domainId: "example", deniedEvidenceKeys: [], tools: [RUN_NODE], executeTool: async () => ({}), startState: async () => ({ state: {}, differs: [] }) };
  const ports = automationStudioProjectBuildBriefPorts({
    project: { ledger: project, binding, hostRuntime: undefined, flowInputs: [], cancellation: { tool: (execute: unknown) => execute }, permissions: { permittedConsequences: [], instructionIds: [] }, personAsk: undefined, trialEnvironment: {}, runHarness: async () => ({}) },
    draft: { submission: { projectId: "project", flowId: "flow", resolution: {}, instructionText: "", originalSource: "", signal: new AbortController().signal }, loop: {}, maxConsecutiveUnusableDecisions: 3 },
    decisions: { decide: () => async () => ({ kind: "complete", result: {} }) },
    subflowTrial: {}, proposals: {}, accounting: () => ({}), acts: { calls: (calls: unknown) => calls, trialRan: () => undefined }
  } as unknown as Parameters<typeof automationStudioProjectBuildBriefPorts>[0]);
  const request = (briefId: string) => ({
    brief: { briefId, kind: "build", subflowKey: "keep", parts: [], permittedActs: [], maxIterations: 4 },
    scope: { buildId: "build.1", briefId, planDigest: "plan.1", subflowKey: "keep", predecessors: [], parts: [], interface: { inputs: [], outputs: [] } },
    ledger: project.forBrief(briefId), lease: {}, signal: new AbortController().signal
  }) as unknown as AutomationStudioProjectBriefPortRequest;
  return { ports, request };
}

describe("the explored toggles of a project build", () => {
  it("are one record for every brief: a press explored in brief 1 is read by brief 2's submission", async () => {
    const { ports, request } = factory();
    const one = await ports.builder(request("brief.1"));
    const two = await ports.builder(request("brief.2"));
    await one.loop.executeTool({ callId: "c1", toolId: "core.run_node", value: PRESS as unknown as JsonObject });
    expect(one.submission.exploredToggles?.list()).toMatchObject([{ callId: "c1", node: "domain.demo.press", signature: { state: "s.on" } }]);
    expect(two.submission.exploredToggles?.list()).toMatchObject([{ callId: "c1", node: "domain.demo.press" }]);
  });

  it("are not shared between two project builds", async () => {
    const a = factory();
    const b = factory();
    const one = await a.ports.builder(a.request("brief.1"));
    const other = await b.ports.builder(b.request("brief.1"));
    await one.loop.executeTool({ callId: "c1", toolId: "core.run_node", value: PRESS as unknown as JsonObject });
    expect(one.submission.exploredToggles?.list()).toHaveLength(1);
    expect(other.submission.exploredToggles?.list()).toEqual([]);
  });
});

// t792 (fix 2 of debug run-mvswfjbq-d0a95f6e): a toggle a subflow trial's press
// made reaches the next revision of the same step that a repair brief of the
// same project build submits, grounding the repair's explicit `ensureState` choice.
//
// The press answers exactly as the web domain's runtime path builds it: the
// client's action result (its raw `toggle` signature included) kept whole under
// the dispatch payload's `result`, the signature lifted to the payload's top as
// `toggle: { signature }` (`domain/src/io/gateway-output-dispatcher.ts`), and
// that payload kept by Core's runtime dispatcher as the attempt's
// `outputs.result` beside `outputId`, `ok`, `runtimeCommandId` and
// `runtimeStatus` (`io-policy.ts`). The shape is the one a live run's command
// attempt recorded, trimmed of its page and element.
//
// The repair brief's builder writes its subflow as builders do: as a plan whose
// entry is keyed as the model wrote it (`main`, the key a script's own steps are
// given), which the scoped controller rekeys to the brief's subflow key only
// when it makes the proposal. Every trial runs that proposal, so the trial node
// is `<...>.<subflow key>.<node key>`. The control is generic: a "Pin" button on
// a list of saved notes.
//
// The phase start and the harness are replaced as above: what is under test is the wiring.

const PIN: AutomationStudioNodeDefinition = {
  schemaVersion: "0.1", id: "demo.press", version: "1.0.0", label: "Press", description: "Press one control", category: "action",
  source: { kind: "code", moduleId: "test", implementationKey: "test.press", trust: "trusted-local" }, availability: { kind: "global" }, capabilities: { executable: true },
  safety: { requiredPermissions: [] }, inputs: [{ id: "in", label: "In", valueType: "any" }], outputs: [{ id: "success", label: "Success", valueType: "any" }],
  parameters: [{ id: "target", label: "Target", valueType: "object", required: true }, { id: "ensureState", label: "Ensure state", valueType: "object" }]
};
const SELECTOR = "main > ul > li:nth-of-type(2) button.pin";
/** The state the trial's press left the note's control in: it showed "Pin" and now shows "Unpin". */
const SIGNATURE = { via: "name", gains: ["unpin"], loses: ["pin"] };

/** A press's dispatch answer as the web domain's runtime path returns it, kept by Core's runtime dispatcher as the attempt's outputs (header). */
function pressOutputs(): JsonObject {
  const clientResult = {
    commandId: "client.command.pin", actionType: "web.dom.click", status: "succeeded",
    validation: { status: "passed", expected: "the click lands on the target or something inside it", actual: "the point 814,551 landed on svg, inside the target" },
    message: "Element clicked.", url: "https://notes.test/saved", title: "Saved notes",
    resolution: { strategy: "selector", candidateCount: 1, bestScore: 0.792, confidence: 0.697 },
    toggle: SIGNATURE, startedAt: 1_000, finishedAt: 1_100, sourceId: "tab:1:frame:0"
  };
  const dispatchPayload = { status: "succeeded", message: "Element clicked.", result: clientResult, toggle: { signature: SIGNATURE } };
  return { outputId: "web.dom.click", ok: true, runtimeCommandId: "command.pin", runtimeStatus: "succeeded", result: dispatchPayload };
}

const SCOPE = (briefId: string): AutomationStudioSubflowScope => ({
  buildId: "build.1", briefId, planDigest: "plan.1", subflowKey: "pin_notes", predecessors: [],
  parts: [{ partId: "part.1", sourceId: "instruction", text: "pin the second saved note" }]
});

/** The build brief's proposal a trial ran: the press on the second note's Pin button, resolved. */
function triedProposal(): AutomationStudioSubflowProposal {
  return {
    scope: { buildId: "build.1", briefId: "brief-1", planDigest: "plan.1", subflowKey: "pin_notes" }, revision: 1, digest: "pin.1", summary: "Pin the note", changedPaths: [],
    subflows: [{
      key: "pin_notes", name: "Pin notes", role: "primary", interface: { inputs: [], outputs: [] },
      nodes: [{ key: "start", definitionId: "builtin.control.start", definitionVersion: "1.0.0" }, { key: "pin", definitionId: PIN.id, definitionVersion: PIN.version, consequences: ["modify_existing"], parameters: { target: { selector: SELECTOR } } }],
      edges: [{ key: "next", source: { nodeKey: "start", portId: "success" }, target: { nodeKey: "pin", portId: "in" } }]
    }]
  };
}

/** The repair brief's resubmission of the same step, under a handle its own look printed (never pressed while exploring), its entry keyed as the model wrote it. */
const RESUBMITTED: JsonObject = {
  summary: "Pin the second saved note",
  plan: {
    schemaVersion: "0.1", router: { name: "Pin", rules: [], fallback: { kind: "subflow", targetSubflowKey: "main" } },
    subflows: [{ key: "main", name: "Main", role: "primary", nodes: [{ key: "pin", definitionId: PIN.id, definitionVersion: PIN.version, consequences: ["modify_existing"], parameters: { target: { handle: "t9" } } }], edges: [] }]
  }
};

/** The model copies a state observed for this step; the resolver must retain its explicit choice. */
function choosingState(submission: JsonObject, nodeKey: string): JsonObject {
  const chosen = structuredClone(submission);
  const subflow = ((chosen.plan as JsonObject).subflows as JsonObject[])[0]!;
  const node = (subflow.nodes as JsonObject[]).find(entry => entry.key === nodeKey);
  if (!node) throw new Error("test.state_choice_step_missing");
  node.parameters = { ...(node.parameters as JsonObject), ensureState: structuredClone(SIGNATURE) };
  return chosen;
}

function trialledBuild() {
  const toggles = new AutomationStudioExploredToggles();
  const registry = new AutomationStudioNodeRegistry([...canonicalBuiltinAutomationNodeDefinitions, PIN]);
  const trial = subflowTrialFixture();
  const { resolution } = trial.ports;
  // The domain resolves the handle its look printed to the control the trial pressed.
  // Any other handle is another control of the page (t792: a step a repair inserts before the press).
  const resolving = { resolvePlanNodeParameters: async ({ parameters }: { parameters: JsonObject }) => {
    const handle = String((parameters.target as JsonObject).handle);
    return { status: "resolved" as const, parameters: { ...parameters, target: { selector: handle === "t9" ? SELECTOR : `#${handle}` } }, handleViews: [{ handle, view: 2, location: "https://notes.test/saved" }] };
  } };
  const project = new AutomationStudioSiteResetProjectLedger();
  const binding = { domainId: "example", deniedEvidenceKeys: [], tools: [RUN_NODE], executeTool: async () => ({}), startState: async () => ({ state: {}, differs: [] }) };
  const ports = automationStudioProjectBuildBriefPorts({
    project: { ledger: project, binding, hostRuntime: undefined, flowInputs: [], cancellation: { tool: (execute: unknown) => execute }, permissions: { permittedConsequences: ["modify_existing"], instructionIds: [] }, personAsk: undefined, trialEnvironment: { exploredToggles: toggles }, runHarness: async () => ({}) },
    draft: { submission: { projectId: "project", flowId: "parent", registry, resolution, binding: resolving, baseDependencyDigest: "base", instructionText: "", originalSource: "", signal: new AbortController().signal }, loop: {}, maxConsecutiveUnusableDecisions: 3 },
    decisions: { decide: () => async () => ({ kind: "complete", result: {} }) },
    subflowTrial: {}, proposals: {}, accounting: () => ({}), acts: { calls: (calls: unknown) => calls, trialRan: () => undefined }
  } as unknown as Parameters<typeof automationStudioProjectBuildBriefPorts>[0]);
  const request = (briefId: string, kind: "build" | "repair") => ({
    brief: { briefId, kind, subflowKey: "pin_notes", parts: [], permittedActs: ["modify_existing"], maxIterations: 4 },
    scope: SCOPE(briefId), ledger: project.forBrief(briefId), lease: {}, signal: new AbortController().signal
  }) as unknown as AutomationStudioProjectBriefPortRequest;
  // The build brief's subflow trial, run over the shared record as the build's trial environment carries it.
  trial.setPredecessors([]);
  trial.ports.registry = registry;
  trial.ports.exploredToggles = toggles;
  trial.ports.graphOptions = ({ signal }) => ({ signal, now: () => 100, nativeNodeExecutor: async () => ({ result: { status: "success", route: "success", outputs: pressOutputs() } }) } as ReturnType<typeof trial.ports.graphOptions>);
  const runTrial = async () => await runAutomationStudioSubflowTrial({ scope: { ...SCOPE("brief-1"), predecessors: [] }, proposal: triedProposal(), signal: new AbortController().signal }, trial.ports);
  return { toggles, ports, request, runTrial };
}

describe("a toggle a subflow trial pressed, in a project build", () => {
  it("is recorded from the dispatch payload as the web domain returns it, under the trial node of the proposal's step", async () => {
    const { toggles, runTrial } = trialledBuild();
    await runTrial();
    const recorded = toggles.list();
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({ node: PIN.id, handles: [], signature: SIGNATURE });
    expect(recorded[0]!.trialNodes).toHaveLength(1);
    expect(recorded[0]!.trialNodes![0]).toMatch(/\.pin_notes\.pin$/u);
  });

  it("requires and grounds the repair's explicit observed state, though its entry was written under another key", async () => {
    const { ports, request, runTrial } = trialledBuild();
    await runTrial();
    const repair = await ports.builder(request("brief-2", "repair"));
    const controller = new AutomationStudioSubflowScopedSubmissionController({ scope: SCOPE("brief-2"), siblings: [], submission: repair.submission });
    const missing = await controller.submit(RESUBMITTED);
    expect(missing.ok).toBe(false);
    if (missing.ok) throw new Error("test.missing_state_choice_accepted");
    expect(missing.check.issueCodes).toContain("candidate.toggle_state_required");
    const submitted = await controller.submit(choosingState(RESUBMITTED, "pin"));
    expect(submitted.ok, JSON.stringify(submitted)).toBe(true);
    if (!submitted.ok) return;
    const pin = submitted.proposal.subflows.find((subflow) => subflow.key === "pin_notes")?.nodes.find((node) => node.key === "pin");
    expect(pin?.parameters).toEqual({ target: { selector: SELECTOR }, ensureState: SIGNATURE });
  });

  // t792: the repair writes a press of another control first, and that step takes the key the trial's node had
  // (`pin`), as a script's renumbered `s1` would; the Pin step moves to a new key.
  it("stays on the Pin step when the repair's resubmission inserts a press of another control before it", async () => {
    const { ports, request, runTrial } = trialledBuild();
    await runTrial();
    const repair = await ports.builder(request("brief-2", "repair"));
    const controller = new AutomationStudioSubflowScopedSubmissionController({ scope: SCOPE("brief-2"), siblings: [], submission: repair.submission });
    const main = (RESUBMITTED.plan as JsonObject).subflows as JsonObject[];
    const press = (key: string, handle: string) => ({ key, definitionId: PIN.id, definitionVersion: PIN.version, consequences: ["modify_existing"], parameters: { target: { handle } } });
    const inserted = { ...RESUBMITTED, plan: { ...(RESUBMITTED.plan as JsonObject), subflows: [{ ...main[0]!, nodes: [press("pin", "t4"), press("pin2", "t9")], edges: [{ key: "next", source: { nodeKey: "pin", portId: "success" }, target: { nodeKey: "pin2", portId: "in" } }] }] } };
    const submitted = await controller.submit(choosingState(inserted, "pin2"));
    expect(submitted.ok, JSON.stringify(submitted)).toBe(true);
    if (!submitted.ok) return;
    const nodes = submitted.proposal.subflows.find((subflow) => subflow.key === "pin_notes")?.nodes ?? [];
    expect(Object.fromEntries(nodes.map((node) => [node.key, node.parameters]))).toEqual({
      pin: { target: { selector: "#t4" } },
      pin2: { target: { selector: SELECTOR }, ensureState: SIGNATURE }
    });
  });
});
