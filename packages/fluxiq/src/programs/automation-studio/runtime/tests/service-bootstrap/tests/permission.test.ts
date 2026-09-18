// Building a Flow that needs an action with a lasting consequence: the build
// asks, rather than refusing on the domain's judgement or taking the action.
//
// Every failure measured live on a state-changing job was an authoring build,
// and a build had no way to say "this needs a person". These drive the real
// `generateFlowBootstrapAdaptation` with a scripted provider and a stand-in
// domain that asks Core before a press that would refund -- once while
// exploring, and once as a step of the Flow it is resolving -- and then the
// same build again carrying the grant a person would give.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import type { AutomationStudioActionConsequence } from "../../../action-permissions/index.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding, AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../native-node-runtime.ts";
import { AutomationStudioService } from "../../../service.ts";
import { blankFixture, expectNoTopology, grant, mockProvider, rejectedGenerationDiagnostic } from "./fixtures.ts";

const PRESS_ID = "domain.example.press";
const REFUND = { handle: "c4", name: "Refund line 1" };
const OPEN = { handle: "c1", name: "Open order ORD-40100" };

let tempRoot: string;
const services = new Set<AutomationStudioService>();

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-bootstrap-permission-"));
});

afterEach(async () => {
  await Promise.all([...services].map((instance) => instance.close()));
  services.clear();
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

describe("building a Flow that needs an action a person has not allowed", () => {
  it("ends the build when an exploration step needs it, carrying the request, and never takes the action", async () => {
    const run = await build([pressDecision(REFUND.handle), complete(pressPlan(OPEN.handle))]);
    const diagnostic = await rejectedGenerationDiagnostic(run.generation);

    expect(run.pressed).toEqual([]);
    expect(diagnostic).toMatchObject({
      code: "flow_bootstrap.permission_required",
      stage: "provider_output_validation",
      providerInvocation: "attempted",
      permissionRequest: {
        schemaVersion: "automation-studio.action-permission-request.v1",
        action: { kind: "exploration_step", id: "example.press", verb: "press" },
        control: { name: REFUND.name, kind: "button" },
        consequences: ["move_money", "modify_existing"],
        missing: ["move_money", "modify_existing"],
        reason: { stage: "authoring", instructionIds: ["instruction.build"] },
        authority: { granted: [], instructed: [] }
      },
      // The one call that read the instruction is counted with the build.
      accounting: { inputTokens: 200, outputTokens: 100 }
    });
    expect(diagnostic.permissionRequest!.sentence).toContain("\"Refund line 1\"");
    // Terminal: the model is not asked what to do instead.
    expect(run.requests).toHaveLength(1);
    await expectNoTopology(run.instance, run.project.id, run.flow.flowId);
    await expect(run.instance.listFlowAdaptationSummaries({ projectId: run.project.id, limit: 10, offset: 0 })).resolves.toMatchObject({ total: 0 });
    expect(run.revoke).toHaveBeenCalledTimes(1);
  });

  it("ends the build when the Flow it wrote would take the action, rather than building a Flow that would", async () => {
    const run = await build([complete(pressPlan(REFUND.handle))]);
    const diagnostic = await rejectedGenerationDiagnostic(run.generation);

    expect(diagnostic).toMatchObject({
      code: "flow_bootstrap.permission_required",
      permissionRequest: {
        action: { kind: "flow_step", id: PRESS_ID, ref: "primary.press", verb: "press" },
        control: { name: REFUND.name, kind: "button" },
        missing: ["move_money", "modify_existing"]
      },
      evidenceLoop: { toolCallCount: 1 }
    });
    expect(diagnostic.permissionRequest!.sentence).toContain("each time it runs");
    expect(run.requests).toHaveLength(1);
    await expect(run.instance.listFlowAdaptationSummaries({ projectId: run.project.id, limit: 10, offset: 0 })).resolves.toMatchObject({ total: 0 });
  });

  it("builds a Flow whose steps have no lasting consequence without asking anything", async () => {
    const run = await build([pressDecision(OPEN.handle), complete(pressPlan(OPEN.handle))]);

    await expect(run.generation).resolves.toMatchObject({ status: "proposed" });
    expect(run.pressed).toEqual([OPEN.handle]);
  });
});

describe("the same build, when the instruction itself asks for it", () => {
  it("goes ahead with no grant, and keeps what the instruction asked for with the proposal and the Flow", async () => {
    const run = await build([pressDecision(REFUND.handle), complete(pressPlan(REFUND.handle))], undefined, [
      { consequence: "move_money", quote: "Refund the first line" },
      { consequence: "modify_existing", quote: "refund the first line of Ada Lovelace's order" }
    ]);
    const result = await run.generation;

    expect(run.pressed).toEqual([REFUND.handle]);
    expect(run.authorityRequests).toHaveLength(1);
    const stored = await run.instance.getFlowBootstrapAdaptation(run.project.id, run.flow.flowId, result.adaptationId);
    expect(stored!.instructedConsequences?.map((entry) => [entry.consequence, entry.instructionId, entry.quote])).toEqual([
      ["move_money", "instruction.build", "Refund the first line"],
      ["modify_existing", "instruction.build", "refund the first line of Ada Lovelace's order"]
    ]);
    await run.instance.reviewFlowBootstrapAdaptation({ projectId: run.project.id, flowId: run.flow.flowId, adaptationId: result.adaptationId, action: "approve" });
    await run.instance.reviewFlowBootstrapAdaptation({ projectId: run.project.id, flowId: run.flow.flowId, adaptationId: result.adaptationId, action: "apply" });
    const applied = await run.instance.getFlow(run.project.id, run.flow.flowId);
    expect(applied.metadata?.bootstrapInstructedConsequences).toEqual(stored!.instructedConsequences);
  });

  it("still asks for a consequence the instruction did not ask for", async () => {
    const run = await build([pressDecision(REFUND.handle)], undefined, [{ consequence: "move_money", quote: "Refund the first line" }]);
    const diagnostic = await rejectedGenerationDiagnostic(run.generation);

    expect(diagnostic.permissionRequest).toMatchObject({ missing: ["modify_existing"], authority: { granted: [], instructed: [{ consequence: "move_money", quote: "Refund the first line" }] } });
    expect(run.pressed).toEqual([]);
  });

  it("does not count a claim the instruction's words do not support", async () => {
    const run = await build([pressDecision(REFUND.handle)], undefined, [{ consequence: "move_money", quote: "refund every order in the book" }, { consequence: "modify_existing", quote: "edit anything" }]);
    const diagnostic = await rejectedGenerationDiagnostic(run.generation);

    expect(diagnostic.permissionRequest).toMatchObject({ missing: ["move_money", "modify_existing"], authority: { instructed: [] } });
  });

  it("never reads the instruction for a build with no lasting consequence", async () => {
    const run = await build([pressDecision(OPEN.handle), complete(pressPlan(OPEN.handle))]);

    await expect(run.generation).resolves.toMatchObject({ status: "proposed" });
    expect(run.authorityRequests).toHaveLength(0);
  });
});

describe("the same build, carrying what the person allowed", () => {
  it("takes the action while exploring and builds the Flow that takes it", async () => {
    const run = await build([pressDecision(REFUND.handle), complete(pressPlan(REFUND.handle))], ["move_money", "modify_existing"]);
    const result = await run.generation;

    expect(result.status).toBe("proposed");
    expect(run.pressed).toEqual([REFUND.handle]);
    const stored = await run.instance.getFlowBootstrapAdaptation(run.project.id, run.flow.flowId, result.adaptationId);
    expect(stored!.buildPlan.plan.subflows[0]!.nodes.find((node) => node.key === "press")?.parameters).toEqual({ control: REFUND.name });
  });

  it("still asks for what the grant does not cover", async () => {
    const run = await build([pressDecision(REFUND.handle)], ["modify_existing"]);
    const diagnostic = await rejectedGenerationDiagnostic(run.generation);

    expect(diagnostic.permissionRequest).toMatchObject({ consequences: ["move_money", "modify_existing"], missing: ["move_money"] });
    expect(run.pressed).toEqual([]);
  });

  it("refuses a grant that names a class Core does not recognise, before any call is made", async () => {
    const run = await build([pressDecision(REFUND.handle)], ["purchase"] as unknown as AutomationStudioActionConsequence[]);
    const diagnostic = await rejectedGenerationDiagnostic(run.generation);

    expect(diagnostic).toMatchObject({ code: "flow_bootstrap.invalid_input", providerInvocation: "not_attempted" });
    expect(run.requests).toHaveLength(0);
    expect(run.pressed).toEqual([]);
  });
});

/** One build whose model answers with each decision in turn; the last repeats. `instructed` is its answer when asked what the instruction asks for. */
async function build(decisions: JsonObject[], permittedConsequences?: AutomationStudioActionConsequence[], instructed: JsonObject[] = []) {
  const requests: AutomationStudioLlmTaskRequest[] = [];
  const authorityRequests: AutomationStudioLlmTaskRequest[] = [];
  const pressed: string[] = [];
  const provider = mockProvider(async (request) => {
    if (request.context.evidenceLoop?.tools.length === 0) {
      authorityRequests.push(request);
      return {
        response: { kind: "evidence_tool_decision", summary: "Read the instruction.", decision: { kind: "complete", result: { instructed } } },
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCostUsd: 0.001 }
      };
    }
    requests.push(request);
    const decision = decisions[Math.min(requests.length, decisions.length) - 1]!;
    return {
      response: { kind: "evidence_tool_decision", summary: "Refund the line.", decision },
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCostUsd: 0.001 }
    };
  });
  const revoke = vi.fn();
  const instance = new AutomationStudioService({
    dataDir: tempRoot,
    llmProviderResolver: (() => ({ provider, maxCallsPerRun: 6 })) as never,
    llmEvidenceRuntime: refundingBinding(pressed),
    revokeLlmExecutionGrant: revoke
  }).bindNativeNodeRuntime(pressRuntime());
  services.add(instance);
  const { project, flow } = await blankFixture(instance, "active", "example");
  const instruction = await instance.getFlowInstruction(project.id, "instruction.build");
  await instance.saveFlowInstruction(project.id, { ...instruction!, body: "Refund the first line of Ada Lovelace's order.", updatedAt: Date.now() });
  const executionGrant = await grant(instance, project.id, flow.flowId);
  const generation = instance.generateFlowBootstrapAdaptation({
    projectId: project.id,
    flowId: flow.flowId,
    evidenceGuided: true,
    executionGrant: permittedConsequences ? { ...executionGrant, permittedConsequences } : executionGrant
  });
  return { instance, project, flow, requests, authorityRequests, pressed, revoke, generation };
}

/**
 * The stand-in domain. It shows two controls, and it knows which press would
 * have a lasting consequence: the refund. It asks Core before pressing it, and
 * again before resolving a Flow step that would press it.
 */
function refundingBinding(pressed: string[]): AutomationStudioLlmEvidenceRuntimeBinding {
  const controls = new Map([[OPEN.handle, OPEN.name], [REFUND.handle, REFUND.name]]);
  const declaration = (handle: string) => handle === REFUND.handle
    ? { consequences: ["move_money", "modify_existing"] as AutomationStudioActionConsequence[], control: { name: REFUND.name, kind: "button" }, verb: "press" }
    : undefined;
  return {
    domainId: "example",
    deniedEvidenceKeys: [],
    tools: [
      { toolId: "example.inspect", description: "Read the order in view.", inputSchema: { type: "object" }, effect: "observe", initialObservation: { input: {} } },
      { toolId: "example.press", description: "Press a control by its handle.", inputSchema: { type: "object" }, effect: "mutate" }
    ],
    executeTool: async (input) => {
      if (input.toolId === "example.inspect") {
        return { kind: "llm_evidence_tool_execution", evidence: { controls: [...controls].map(([handle, name]) => ({ handle, name })) }, effectApplied: false };
      }
      const handle = String(input.value.handle);
      const asks = declaration(handle);
      if (asks && !(await input.permission(asks)).permitted) {
        return { kind: "llm_evidence_tool_execution", evidence: { ok: false, code: "permission_required" }, effectApplied: false, resultCode: "example.permission_required" };
      }
      pressed.push(handle);
      return { kind: "llm_evidence_tool_execution", evidence: { pressed: controls.get(handle) ?? null }, effectApplied: true };
    },
    resolvePlanNodeParameters: async ({ nodeDefinitionId, parameters, permission }) => {
      if (nodeDefinitionId !== PRESS_ID) return { status: "unchanged" };
      const written = parameters.control;
      const handle = isHandle(written) ? written.handle : undefined;
      if (!handle || !controls.has(handle)) return { status: "refused", issueCodes: ["example.control_not_observed"] };
      const asks = declaration(handle);
      if (asks && !(await permission(asks)).permitted) return { status: "refused", issueCodes: ["example.permission_required"] };
      return { status: "resolved", parameters: { control: controls.get(handle)! } };
    }
  };
}

function pressRuntime() {
  const press: AutomationStudioNodeDefinition = {
    schemaVersion: "0.1",
    id: PRESS_ID,
    version: "1.0.0",
    label: "Press control",
    description: "Press one control in the active target.",
    category: "action",
    source: { kind: "importer", domainId: "example", packageId: "example.package", implementationKey: "example.press" },
    availability: { kind: "domain", domainId: "example" },
    requiredRuntimeCapabilities: ["example.actions"],
    capabilities: { executable: true, codeBacked: true },
    inputs: [{ id: "in", label: "In", valueType: "any", required: false }],
    outputs: [{ id: "success", label: "Success", valueType: "any" }],
    parameters: [{ id: "control", label: "Control", valueType: "string", required: true, constraints: { minLength: 1 } }],
    outputAction: { fixedOutputId: "example.press" }
  };
  return new AutomationStudioNativeNodeRuntime({ permissions: [], runtimeCapabilities: ["example.actions"] }).register({
    schemaVersion: "0.1",
    sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION,
    packageId: "example.package",
    packageVersion: "1.0.0",
    domainId: "example",
    nodes: [press]
  }, {
    packageId: "example.package",
    packageVersion: "1.0.0",
    implementations: { "example.press": () => ({ status: "success", route: "success", outputs: { success: true } }) }
  });
}

function isHandle(value: JsonValue | undefined): value is { handle: string } {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && typeof (value as JsonObject).handle === "string";
}

function pressDecision(handle: string): JsonObject {
  return { kind: "tool_call", callId: `call.${handle}`, toolId: "example.press", input: { handle } };
}

function complete(plan: JsonObject): JsonObject {
  return { kind: "complete", result: { summary: "Press the control.", plan } };
}

function pressPlan(handle: string): JsonObject {
  return {
    schemaVersion: "0.1",
    router: { name: "Refund", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } },
    subflows: [{
      key: "primary",
      name: "Refund the line",
      role: "primary",
      nodes: [
        { key: "start", definitionId: "builtin.control.start", definitionVersion: "1.0.0" },
        { key: "press", definitionId: PRESS_ID, definitionVersion: "1.0.0", parameters: { control: { handle } }, outputActionId: "example.press" },
        { key: "end", definitionId: "builtin.control.end", definitionVersion: "1.0.0" }
      ],
      edges: [
        { key: "start_press", source: { nodeKey: "start", portId: "next" }, target: { nodeKey: "press", portId: "in" } },
        { key: "press_end", source: { nodeKey: "press", portId: "success" }, target: { nodeKey: "end", portId: "in" } }
      ]
    }]
  };
}
