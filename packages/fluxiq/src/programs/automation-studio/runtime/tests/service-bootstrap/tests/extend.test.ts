// Building onto a Flow that already exists, through the service, end to end.
//
// Every other part of this is unit-tested in the directory that owns it. What
// only a service can show is that the parts meet: that the door opens for a
// non-blank Flow, that the Flow on disk is read back as the draft the build
// starts from, that the same assembler turns the amended draft into a plan, and
// that what comes out the other side carries the *existing* Flow's ids rather
// than a new set. A composition that type-checks and does not compose is the
// failure this file is for, and it is the one a live run would otherwise find.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import { validateAutomationStudioFlowBootstrapPlan, type AutomationStudioFlowBuildPlan } from "../../../flow-bootstrap/index.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding, AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../native-node-runtime.ts";
import type { AutomationStudioLlmProviderResolverInput } from "../../../service.ts";
import { AutomationStudioService } from "../../../service.ts";
import { automationStudioReplayingBinding } from "../../replaying-binding.ts";
import { caller, isJudgeRequest, judgeReply, mockProvider } from "./fixtures.ts";

const OPEN_ID = "domain.example.open";
const READ_ID = "domain.example.read";
/** The node the Flow was missing, and which only an exploration finds. */
const SEARCH_ID = "domain.example.search";

let tempRoot: string;
const services = new Set<AutomationStudioService>();

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-bootstrap-extend-"));
});

afterEach(async () => {
  await Promise.all([...services].map((instance) => instance.close()));
  services.clear();
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

function definition(id: string, label: string): AutomationStudioNodeDefinition {
  return {
    schemaVersion: "0.1",
    id,
    version: "1.0.0",
    label,
    description: `${label} in the active target.`,
    category: "action",
    source: { kind: "importer", domainId: "example", packageId: "example.package", implementationKey: id },
    availability: { kind: "domain", domainId: "example" },
    requiredRuntimeCapabilities: ["example.actions"],
    capabilities: { executable: true, codeBacked: true },
    inputs: [{ id: "in", label: "In", valueType: "any", required: false }],
    outputs: [{ id: "success", label: "Success", valueType: "any" }],
    parameters: [{ id: "where", label: "Where", valueType: "string", required: false }],
    outputAction: { fixedOutputId: id }
  };
}

function nativeRuntime() {
  return new AutomationStudioNativeNodeRuntime({ permissions: [], runtimeCapabilities: ["example.actions"] }).register({
    schemaVersion: "0.1",
    sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION,
    packageId: "example.package",
    packageVersion: "1.0.0",
    domainId: "example",
    nodes: [definition(OPEN_ID, "Open"), definition(READ_ID, "Read"), definition(SEARCH_ID, "Search")]
  }, {
    packageId: "example.package",
    packageVersion: "1.0.0",
    implementations: {
      [OPEN_ID]: () => ({ status: "success", route: "success", outputs: { success: true } }),
      [READ_ID]: () => ({ status: "success", route: "success", outputs: { success: true } }),
      [SEARCH_ID]: () => ({ status: "success", route: "success", outputs: { success: true } })
    }
  });
}

/**
 * The domain: one free look, and the ability to run a node of the library --
 * which is what makes an exploration's steps the Flow's own steps.
 */
function binding(): AutomationStudioLlmEvidenceRuntimeBinding {
  return {
    domainId: "example",
    deniedEvidenceKeys: [],
    tools: [{ toolId: "example.inspect", description: "Inspect what is in view.", inputSchema: { type: "object" }, effect: "observe", initialObservation: { input: {} } }],
    runsNodes: {},
    executeTool: async ({ toolId, value }) => toolId === "core.run_node"
      // What the call did, as the domain reports it: which node, and that a
      // result should contain it. Core reads the name and never interprets it.
      ? { kind: "llm_evidence_tool_execution" as const, evidence: { ran: String(value.node) }, effectApplied: true, draft: { actionId: String(value.node), input: value, proposes: true } }
      : { controls: [{ label: "Search" }] }
  };
}

/** The Flow the run executed: open, then read. The one it was missing is a search between them. */
function firstBuildPlan(runtime: AutomationStudioNativeNodeRuntime, scope: Parameters<AutomationStudioNativeNodeRuntime["getRegistryResolution"]>[0]): AutomationStudioFlowBuildPlan {
  const result = validateAutomationStudioFlowBootstrapPlan({
    plan: {
      schemaVersion: "0.1",
      router: { name: "Instruction router", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } },
      subflows: [{
        key: "primary",
        name: "Primary",
        role: "primary",
        nodes: [
          { key: "s1", definitionId: OPEN_ID, definitionVersion: "1.0.0", parameters: { where: "catalog" }, outputActionId: OPEN_ID },
          { key: "s2", definitionId: READ_ID, definitionVersion: "1.0.0", parameters: { where: "rows" }, outputActionId: READ_ID }
        ],
        edges: [{ key: "e1", source: { nodeKey: "s1", portId: "success" }, target: { nodeKey: "s2", portId: "in" } }]
      }]
    },
    registry: runtime.sdk.nodes,
    resolution: runtime.getRegistryResolution(scope)
  });
  if (!result.validated) throw new Error(JSON.stringify(result.issues));
  return result.validated;
}

const USAGE = { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCostUsd: 0.001 };

/** A model reply carrying `decision`. */
function reply(summary: string, decision: Record<string, unknown>) {
  return { response: { kind: "evidence_tool_decision", summary, decision }, usage: { ...USAGE } };
}

/**
 * Rerun the draft's step `step`, declaring that it leaves nothing lasting.
 *
 * The steps an extend carries from the Flow on disk (`f1`, `f2`) never ran in
 * this build, so the Flow could not be run whole from its start and the build
 * may not finish over them (t244, user 2026-10-02; `flow-draft/full-run-required.ts`).
 * A rerun runs the carried step now, takes its place in the draft, and stands
 * for its node, so the written Flow keeps that node's id.
 */
function rerun(step: number) {
  return reply(`Run step ${step} again.`, { kind: "amend_draft", amendments: [{ step, change: "rerun", input: { consequences: [] } }] });
}

/**
 * Rerun both carried steps, the first then the second. A rerun takes its
 * step's place and the step it replaced stays listed, withdrawn, just after it
 * (`llm/evidence-loop/rerun-replacement.ts`): once `f1` is rerun the draft
 * reads rerun, `f1` withdrawn, `f2`, so `f2` is then step 3.
 */
const RERUN_CARRIED = [rerun(1), rerun(3)];

/** Each reply in turn, the last one repeated. */
function inOrder(replies: unknown[]) {
  let at = 0;
  return async () => replies[Math.min(at++, replies.length - 1)];
}

/**
 * A service holding the applied Flow, whose model decides as `decide` says.
 * The judge of the extended Flow's test says yes. That test runs the whole
 * Flow from its start, carried steps included, so every case that finishes
 * reruns the two steps carried from the Flow on disk first.
 */
async function serviceWithAppliedFlow(input: { decide(request: AutomationStudioLlmTaskRequest): Promise<unknown> }) {
  const runtime = nativeRuntime();
  const requests: AutomationStudioLlmTaskRequest[] = [];
  const resolutions: AutomationStudioLlmProviderResolverInput[] = [];
  const evidenceRuntime = automationStudioReplayingBinding(binding());
  const provider = mockProvider(async (request) => {
    requests.push(request);
    if (isJudgeRequest(request)) return judgeReply();
    return await input.decide(request);
  });
  const instance = new AutomationStudioService({
    dataDir: tempRoot,
    llmProviderResolver: ((resolverInput: AutomationStudioLlmProviderResolverInput) => {
      resolutions.push(resolverInput);
      return {
        provider,
        tokenLimits: { maxInputTokens: 992_000, maxOutputTokens: 8_000, maxTotalTokens: 1_000_000 },
        // Two reruns of the carried steps, at most one step of its own, the completion, and the judge.
        maxCallsPerRun: 6,
        maxEstimatedCostUsd: 0.1,
        timeoutMs: 20_000
      };
    }) as never,
    llmEvidenceRuntime: evidenceRuntime
  });
  instance.bindNativeNodeRuntime(runtime);
  services.add(instance);

  const project = await instance.createProject({ name: "Extend", domainId: "example" });
  const flow = await instance.createFlow({ projectId: project.id, flowId: "flow.extend", name: "Catalog" });
  const now = Date.now();
  await instance.saveFlowInstruction(project.id, {
    schemaVersion: "0.1",
    instructionId: "instruction.extend",
    title: "Read the catalog",
    body: "Open the catalog and read the rows it lists.",
    scope: { kind: "flow", projectId: project.id, flowId: flow.flowId },
    priority: 100,
    status: "active",
    requirement: "required",
    createdAt: now,
    updatedAt: now
  });
  // The Flow as it stood when it answered wrongly: created, approved, applied.
  const created = await instance.createFlowBootstrapAdaptation({
    projectId: project.id,
    flowId: flow.flowId,
    baseDependencyDigest: await instance.getLlmExecutionDependencyDigest(project.id, flow.flowId),
    sourceInstructionIds: ["instruction.extend"],
    summary: "Open the catalog and read it.",
    buildPlan: firstBuildPlan(runtime, flow.scope)
  });
  const review = { projectId: project.id, flowId: flow.flowId, adaptationId: created.adaptationId, actorId: "reviewer" };
  await instance.reviewFlowBootstrapAdaptation({ ...review, action: "approve" });
  const applied = await instance.reviewFlowBootstrapAdaptation({ ...review, action: "apply" });
  return { instance, project, flow, applied, requests, resolutions, runtime, replays: evidenceRuntime.replays };
}

describe("extending a Flow that already exists", () => {
  it("opens for a non-blank Flow, starts from its steps, and keeps its ids", async () => {
    const { instance, project, flow, applied, requests, replays } = await serviceWithAppliedFlow({
      decide: inOrder([...RERUN_CARRIED, reply("Search first, then read.", { kind: "complete", result: { summary: "Search the catalog, then read the rows." } })])
    });
    const before = applied.topology.subflows[0]!;

    const result = await instance.generateFlowBootstrapAdaptation({
      projectId: project.id,
      flowId: flow.flowId,
      mode: "extend",
      evidenceGuided: true,
      caller: caller()
    });

    const record = (await instance.getFlowBootstrapAdaptation(project.id, flow.flowId, result.adaptationId))!;
    // The third entry point, with a producer at last.
    expect(record.mode).toBe("extend");
    expect(record.origin).toEqual({ entryPoint: "edge_case", instructionIds: ["instruction.extend"] });
    // The build started from the Flow rather than from nothing: the plan holds
    // the two steps that were already there, written from the draft the seed
    // made -- each run again in this build, standing for the node it replaced.
    const after = record.topology.subflows[0]!;
    expect(after.graphFlow.nodes.map((node) => node.definitionId)).toEqual([OPEN_ID, READ_ID]);
    // And it is an edit: the Router, the Subflow, the graph Flow and every node
    // are the same things they were, not new ones beside them.
    expect(record.topology.router.routerId).toBe(applied.topology.router.routerId);
    expect(after.subflow.subflowId).toBe(before.subflow.subflowId);
    expect(after.graphFlow.flowId).toBe(before.graphFlow.flowId);
    expect(after.graphFlow.nodes.map((node) => node.id)).toEqual(before.graphFlow.nodes.map((node) => node.id));
    expect(record.existingIds).toMatchObject({ routerId: applied.topology.router.routerId, subflowId: before.subflow.subflowId, graphFlowId: before.graphFlow.flowId });
    // The model was asked, and the loop it was asked through is the build's own.
    expect(requests.some((request) => request.taskKind === "evidence_tool_decision")).toBe(true);
    // And the extended Flow was tested whole from its start -- both steps run
    // again by the build's test -- and judged, once, after the model said it was ready.
    expect(replays.filter((call) => call.value.replay !== "reset").map((call) => call.value.node)).toEqual([OPEN_ID, READ_ID]);
    expect(requests.filter(isJudgeRequest)).toHaveLength(1);
    expect(isJudgeRequest(requests.at(-1)!)).toBe(true);
  }, 60_000);

  it("runs the step the Flow was missing and adds it, keeping the ids of the ones it kept", async () => {
    // The whole point of routing a wrong answer here: the model looks at the
    // page, runs the control the Flow never had, and the Flow gains that step.
    // It then reruns the two steps it carried, so the Flow can be tested whole.
    const { instance, project, flow, applied } = await serviceWithAppliedFlow({
      decide: inOrder([
        reply("Search first.", { kind: "tool_call", callId: "call.search", toolId: "core.run_node", input: { node: SEARCH_ID, parameters: { where: "widgets" }, consequences: [] }, add: true }),
        ...RERUN_CARRIED,
        reply("Search first.", { kind: "complete", result: { summary: "Search the catalog, then read the rows." } })
      ])
    });
    const before = applied.topology.subflows[0]!;

    const result = await instance.generateFlowBootstrapAdaptation({
      projectId: project.id, flowId: flow.flowId, mode: "extend", evidenceGuided: true,
      caller: caller()
    });
    const record = (await instance.getFlowBootstrapAdaptation(project.id, flow.flowId, result.adaptationId))!;
    const after = record.topology.subflows[0]!;

    // Three steps where the Flow had two, and the new one is the node the
    // exploration actually ran.
    expect(after.graphFlow.nodes.map((node) => node.definitionId)).toEqual([OPEN_ID, READ_ID, SEARCH_ID]);
    // The two it kept are the same nodes; only the added one has a new id.
    const kept = before.graphFlow.nodes.map((node) => node.id);
    expect(after.graphFlow.nodes.slice(0, 2).map((node) => node.id)).toEqual(kept);
    expect(kept).not.toContain(after.graphFlow.nodes[2]!.id);
    expect(record.existingIds?.nodeIdByKey).toEqual({ s1: kept[0], s2: kept[1] });
  }, 60_000);

  it("presents the extend build's caller to the resolver, and nothing else", async () => {
    const { instance, project, flow, resolutions } = await serviceWithAppliedFlow({
      decide: inOrder([...RERUN_CARRIED, reply("Keep the current steps.", { kind: "complete", result: { summary: "Keep the current steps." } })])
    });
    await instance.generateFlowBootstrapAdaptation({
      projectId: project.id,
      flowId: flow.flowId,
      mode: "extend",
      evidenceGuided: true,
      caller: caller()
    });

    expect(resolutions).toEqual([{ projectId: project.id, flowId: flow.flowId, caller: caller() }]);
  }, 60_000);

  it("refuses to build a second Flow beside the first, which is what create would have done", async () => {
    const { instance, project, flow } = await serviceWithAppliedFlow({
      decide: async () => ({
        response: { kind: "evidence_tool_decision", summary: "No.", decision: { kind: "complete", result: { summary: "No." } } },
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.0001 }
      })
    });
    await expect(instance.generateFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, evidenceGuided: true, caller: caller() }))
      .rejects.toThrow(/flow_bootstrap\.blank_target_required/);
  }, 60_000);

  it("applies an extend in place, so the Flow on disk is the edited one", async () => {
    const { instance, project, flow, applied } = await serviceWithAppliedFlow({
      decide: inOrder([...RERUN_CARRIED, reply("Read it again.", { kind: "complete", result: { summary: "Read the rows." } })])
    });
    const result = await instance.generateFlowBootstrapAdaptation({
      projectId: project.id, flowId: flow.flowId, mode: "extend", evidenceGuided: true,
      caller: caller()
    });
    const review = { projectId: project.id, flowId: flow.flowId, adaptationId: result.adaptationId, actorId: "reviewer" };
    await instance.reviewFlowBootstrapAdaptation({ ...review, action: "approve" });
    const reapplied = await instance.reviewFlowBootstrapAdaptation({ ...review, action: "apply" });
    expect(reapplied.status).toBe("applied");

    // One Subflow, not two: the edit went into the Flow that was there.
    await expect(instance.listFlowSubflowSummaries({ projectId: project.id, flowId: flow.flowId, limit: 10, offset: 0 })).resolves.toMatchObject({ total: 1 });
    const graph = await instance.getFlow(project.id, applied.topology.subflows[0]!.graphFlow.flowId) as unknown as { nodes: { id: string }[] };
    expect(graph.nodes.map((node) => node.id)).toEqual(applied.topology.subflows[0]!.graphFlow.nodes.map((node) => node.id));

    // Revert is refused rather than deleting the Flow it edited.
    await expect(instance.reviewFlowBootstrapAdaptation({ ...review, action: "revert" })).rejects.toThrow(/create-mode/);
  }, 60_000);
});
