// t787 fix 1 (`run-mvskptb1-c9cef4fe`): a layer the build closed while
// exploring becomes a handler of the submitted Flow, with no model. The build's
// permission wrapper records each press the domain answered as clearing a
// layer over the page; a submission whose Flow has no step of its own for that
// press gets a handler in every part that presses it whenever its control
// shows; and a run on a page where the layer shows presses it before the
// covered step, then carries on.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import { createBlankAutomationStudioFlowArtifact, type AutomationStudioFlowDocument } from "../../../model/index.ts";
import { AutomationStudioNodeRegistry, type AutomationStudioNodeDefinition } from "../../../nodes/index.ts";
import { runAutomationStudioGraph, type AutomationStudioGraphExecutionOptions } from "../../executor/index.ts";
import { automationStudioFlowBootstrapActionPermissions } from "../action-permissions.ts";
import { normalizeAutomationStudioFlowBuildPlan } from "../adaptation.ts";
import { AutomationStudioFlowCandidateSubmissionController, type AutomationStudioFlowCandidate } from "../candidate/index.ts";
import { AutomationStudioExploredInterruptions } from "../explored-interruptions.ts";
import { savedFlowValidation } from "../plan/tests/index.ts";

const definition: AutomationStudioNodeDefinition = {
  schemaVersion: "0.1", id: "domain.demo.press", version: "1.0.0", label: "Press", description: "Press one control", category: "action",
  source: { kind: "importer", domainId: "demo", implementationKey: "press" }, availability: { kind: "domain", domainId: "demo" }, capabilities: { executable: true },
  inputs: [{ id: "in", label: "In", valueType: "any" }], outputs: [{ id: "success", label: "Success", valueType: "any", role: "success" }, { id: "failed", label: "Failed", valueType: "any", role: "failure" }],
  parameters: [{ id: "target", label: "Target", valueType: "object", required: true }]
};
/** Core's built-ins, the handler nodes among them, and the demo domain's press. */
const registry = new AutomationStudioNodeRegistry().register(definition);
const resolution = { scope: { kind: "domain" as const, domainId: "demo" }, runtimeCapabilities: [], permissions: [] };
/** Each handle's control: `t10` the item the panel covers, `t20` the panel's own collapse control. */
const SELECTORS: Record<string, string> = { t10: "#item", t20: "#panel .collapse" };
const COLLAPSE = { target: { selector: SELECTORS.t20! } };

/** A domain that resolves every handle a view printed, and asks no permission. */
const binding = {
  resolvePlanNodeParameters: async ({ parameters }: { parameters: JsonObject }) => {
    const handle = String((parameters.target as JsonObject).handle);
    return { status: "resolved" as const, parameters: { target: { selector: SELECTORS[handle]! } }, handleViews: [{ handle, view: 1, location: "https://studio.test/" }] };
  }
};

const PRESS = (handle: string, consequences: string[] = []): JsonObject => ({ node: definition.id, parameters: { target: { handle } }, consequences });

/** The domain's answer to a press of the panel's collapse control, which cleared the panel. */
function cleared(extra: JsonObject = {}): JsonObject {
  return {
    kind: "llm_evidence_tool_execution", effectApplied: true,
    evidence: { ok: true, layerCleared: { signature: { layer: { tag: "aside" }, control: { tag: "button" } }, control: "t20" } },
    draft: { actionId: definition.id, ranWith: { node: definition.id, parameters: COLLAPSE } },
    ...extra
  };
}

function candidate(handles: string[]): JsonObject {
  const nodes = handles.map((handle, index) => ({ key: `n${index}`, definitionId: definition.id, definitionVersion: definition.version, consequences: [], parameters: { target: { handle } } }));
  const edges = nodes.slice(1).map((node, index) => ({ key: `e${index}`, source: { nodeKey: nodes[index]!.key, portId: "success" }, target: { nodeKey: node.key, portId: "in" } }));
  return { summary: "Open the item", plan: { schemaVersion: "0.1", router: { name: "Open", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } }, subflows: [{ key: "primary", name: "Primary", role: "primary", nodes, edges }] } };
}

/** The build's record after the one exploration press that collapsed the panel. */
function explored(): AutomationStudioExploredInterruptions {
  const record = new AutomationStudioExploredInterruptions();
  record.explored({ callId: "collapse.1", toolId: "core.run_node", value: PRESS("t20") }, cleared());
  return record;
}

const controller = (exploredInterruptions?: AutomationStudioExploredInterruptions) => new AutomationStudioFlowCandidateSubmissionController({
  projectId: "project.test", flowId: "flow.test", registry, resolution, baseDependencyDigest: "accepted.base", binding, ...(exploredInterruptions ? { exploredInterruptions } : {})
});

async function submitted(handles: string[], record?: AutomationStudioExploredInterruptions): Promise<AutomationStudioFlowCandidate> {
  const answer = await controller(record).submit(candidate(handles));
  if (!answer.ok) throw new Error(JSON.stringify(answer));
  return answer.candidate;
}

describe("the explored interruptions record", () => {
  it("keeps the press's node, its handles, the parameters the domain ran it with and the layer's signature", () => {
    expect(explored().list()).toEqual([{ callId: "collapse.1", node: definition.id, handles: ["t20"], parameters: COLLAPSE, signature: { layer: { tag: "aside" }, control: { tag: "button" } } }]);
  });

  it("keeps nothing for a press that declared a lasting act, a refused call, another tool, or an answer without a well-formed layerCleared", () => {
    const record = new AutomationStudioExploredInterruptions();
    record.explored({ toolId: "core.run_node", value: PRESS("t20", ["modify_existing"]) }, cleared());
    record.explored({ toolId: "core.run_node", value: PRESS("t20") }, cleared({ evidence: { ok: false, layerCleared: { signature: { layer: {} }, control: "t20" } } }));
    record.explored({ toolId: "demo.look", value: PRESS("t20") }, cleared());
    record.explored({ toolId: "core.run_node", value: PRESS("t20") }, cleared({ evidence: { ok: true } }));
    record.explored({ toolId: "core.run_node", value: PRESS("t20") }, cleared({ evidence: { ok: true, layerCleared: { signature: {}, control: "t20" } } }));
    record.explored({ toolId: "core.run_node", value: PRESS("t20") }, cleared({ evidence: { ok: true, layerCleared: { signature: { layer: {} }, control: "not a handle" } } }));
    record.explored({ toolId: "core.run_node", value: PRESS("t20") }, cleared({ draft: { actionId: definition.id } }));
    expect(record.list()).toEqual([]);
  });

  it("is told every call the build's permission wrapper ran, into a record it is given", async () => {
    const shared = new AutomationStudioExploredInterruptions();
    const permissions = automationStudioFlowBootstrapActionPermissions({ permittedConsequences: [], instructionIds: [], exploredInterruptions: shared, executeTool: async () => cleared() });
    await permissions.executeTool({ callId: "c9", toolId: "core.run_node", value: PRESS("t20") });
    expect(permissions.exploredInterruptions).toBe(shared);
    expect(shared.list()).toMatchObject([{ callId: "c9", node: definition.id, parameters: COLLAPSE }]);
  });
});

describe("a submitted Flow and a layer its build closed while exploring", () => {
  it("gets a handler in its part: when the press's control shows, press it, check it is gone, carry on", async () => {
    const plan = (await submitted(["t10"], explored())).buildPlan.plan;
    const primary = plan.subflows[0]!;
    expect(primary.nodes.map((node) => `${node.key} ${node.definitionId}`)).toEqual([
      "n0 domain.demo.press", "layer1-s1 builtin.control.handler", "layer1-s2 domain.demo.press", "layer1-s3 builtin.control.handler-end"
    ]);
    expect(primary.nodes[1]!.parameters).toEqual({
      event: "before",
      scope: { kind: "subflow", inherit: false },
      when: [{ fact: "visible", op: "visible", target: COLLAPSE }],
      order: 1,
      completionCheck: [{ fact: "visible", op: "equals", value: false, target: COLLAPSE }],
      maxRuns: 1
    });
    // The press the build made, with what the domain ran it with, declaring nothing lasting.
    expect(primary.nodes[2]).toMatchObject({ parameters: COLLAPSE, consequences: [] });
    expect(primary.nodes[3]!.parameters).toEqual({ disposition: "resume", checkpointId: "", outputs: {} });
    expect(primary.edges.filter((edge) => edge.key.startsWith("layer1-")).map((edge) => `${edge.source.nodeKey}.${edge.source.portId} -> ${edge.target.nodeKey}.${edge.target.portId}`))
      .toEqual(["layer1-s1.body -> layer1-s2.in", "layer1-s2.success -> layer1-s3.in"]);
    expect(plan.metadata?.requires).toEqual(["flow.handlers@1", "web.facts@1"]);
    // A Flow the plan validator and the saved Flow's own validation both accept.
    expect(savedFlowValidation(plan, registry, resolution).errors).toEqual([]);
  });

  it("gets none without such a press, and still gets one when one of its own steps also makes the press (P6, t796)", async () => {
    expect((await submitted(["t10"])).buildPlan.plan.subflows[0]!.nodes).toHaveLength(1);
    const own = (await submitted(["t20", "t10"], explored())).buildPlan.plan.subflows[0]!;
    expect(own.nodes.map((node) => node.definitionId)).toEqual([definition.id, definition.id, "builtin.control.handler", definition.id, "builtin.control.handler-end"]);
  });
});

/** The page: an item the panel covers while it is open, and the panel's collapse control. */
type Page = { panel: boolean; presses: string[] };

/** What a run on `page` is given: a host that presses on it and reads whether a control is shown on it. */
function onPage(page: Page): AutomationStudioGraphExecutionOptions {
  const selectorOf = (value: unknown): string | undefined => ((value as JsonObject | undefined)?.target as JsonObject | undefined)?.selector as string | undefined;
  return {
    delay: async () => undefined,
    now: () => 1_000,
    hostRuntime: {
      capabilities: ["fact-evaluation"],
      factEvaluator: (conditions) => conditions.map((condition) => {
        const shown = selectorOf(condition.target) === SELECTORS.t20 ? page.panel : undefined;
        const truth = shown === undefined ? "unknown" : (condition.op === "visible") === shown ? "true" : "false";
        return { result: truth, capturedAt: 1_000 };
      })
    },
    nativeNodeExecutor: async (request) => {
      const selector = selectorOf(request.node.parameterValues) ?? "?";
      page.presses.push(selector);
      if (selector === SELECTORS.t20) page.panel = false;
      else if (page.panel) return { result: { status: "failed", route: "failed", outputs: {}, message: "The panel covers the item.", failure: { category: "unexpected_state", code: "web.target.not_actionable", retryable: false, stage: "execution", effect: "unacted" } } };
      return { result: { status: "success", route: "success", outputs: {} } };
    }
  };
}

/** The submitted candidate as apply saves it: its primary part's graph. */
function saved(candidate: AutomationStudioFlowCandidate): AutomationStudioFlowDocument {
  const topology = normalizeAutomationStudioFlowBuildPlan({
    adaptationId: "adaptation.bootstrap.0d4e5f6a-7b8c-4d9e-8f0a-1b2c3d4e5f6a",
    parentFlow: createBlankAutomationStudioFlowArtifact({ flowId: "flow.test", projectId: "project.test", name: "Open the item", now: 1 }),
    buildPlan: candidate.buildPlan, sourceInstructionIds: ["instruction.1"], now: 1
  });
  return topology.subflows[0]!.graphFlow as unknown as AutomationStudioFlowDocument;
}

describe("a run of that Flow", () => {
  it("presses the panel's control before the covered step on a page where the panel shows, then carries on", async () => {
    const flow = saved(await submitted(["t10"], explored()));
    const page: Page = { panel: true, presses: [] };
    const trace = await runAutomationStudioGraph(flow, onPage(page));
    expect(trace.status, JSON.stringify(trace.failure)).toBe("succeeded");
    expect(page.presses).toEqual([SELECTORS.t20, SELECTORS.t10]);
    expect(trace.handlerExecutions?.map((record) => [record.event, record.disposition.kind])).toEqual([["before", "resume"]]);
  });

  it("presses nothing extra on a page where the panel is already gone", async () => {
    const flow = saved(await submitted(["t10"], explored()));
    const page: Page = { panel: false, presses: [] };
    const trace = await runAutomationStudioGraph(flow, onPage(page));
    expect(trace.status).toBe("succeeded");
    expect(page.presses).toEqual([SELECTORS.t10]);
  });

  it("fails at the covered step without it, as playback did", async () => {
    const flow = saved(await submitted(["t10"]));
    const page: Page = { panel: true, presses: [] };
    const trace = await runAutomationStudioGraph(flow, onPage(page));
    expect(trace.status).toBe("failed");
    expect(page.presses).toEqual([SELECTORS.t10]);
  });
});
