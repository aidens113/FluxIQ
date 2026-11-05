// @fluxiq-test-group real-sql
// From a part an attempt ran to the Flow it leaves, through the real assembler and the real service.
// The tool's real answer becomes the draft step the attempt's real completion check assembles; the
// plan is saved as a draft's parts are, proposed, approved and applied; and the applied Flow then runs
// for real, carrying the attempt's acts through the real record, store and run gate.
//
// Stubbed, and only this: the domain's nodes are plain functions, the host answers every fact true and
// no shortlist is searched (the part is offered by name). The evidence loop is not run: the draft step
// is made of the tool's answer as `runtime/llm/evidence-loop/call-record.ts` makes it. The part has
// one press and no row; a row's acts are proven with the real runner in `../run/tests/settled-acts.test.ts`.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GetProjectPartResponse, ListProjectPartsResponse } from "../../../../../api-contracts/automation.ts";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../../../../../flows/executable/graph/index.ts";
import { AutomationStudioAttemptActRecord } from "../../../../../runtime/answer-first/act-record/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../../../runtime/flow-authoring/draft/index.ts";
import { AUTOMATION_STUDIO_LLM_RUN_PART_TOOL_ID, checkAutomationStudioFlowBootstrapCompletion, type AutomationStudioHarnessOptionLoopBinding, type AutomationStudioLlmEvidenceToolExecutionResult } from "../../../../../runtime/llm/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../../../runtime/native-nodes/index.ts";
import type { AutomationStudioKnownParts } from "../../../../../runtime/project-parts/index.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationStudioNodeDefinition } from "../../../nodes/index.ts";
import { AutomationStudioService } from "../../../service.ts";
import { automationStudioAnswerFirstRunActStoreOf } from "../../answer-first/run-acts/index.ts";
import { runAutomationStudioCandidateTrial } from "../../candidate-trial/index.ts";
import type { AutomationStudioFlowPaths, AutomationStudioProjectPaths } from "../../paths/index.ts";
import { automationStudioServiceRegistryResolution, automationStudioServiceWholeTrialPorts } from "../../trial-ports/index.ts";
import { automationStudioAnswerFirstKnownParts } from "../known-parts.ts";

vi.setConfig({ testTimeout: 120_000 });

const PRESS_ID = "domain.example.press";
const OPEN_ID = "domain.example.open";
const CALL = "builtin.control.call-subflow";
const BUILT = "flow.built";

const PRESS: AutomationStudioNodeDefinition = {
  schemaVersion: "0.1", id: PRESS_ID, version: "1.0.0", label: "Press", description: "Press", category: "action",
  source: { kind: "importer", domainId: "example", packageId: "example.package", implementationKey: PRESS_ID },
  availability: { kind: "domain", domainId: "example" }, requiredRuntimeCapabilities: ["example.actions"], capabilities: { executable: true },
  inputs: [{ id: "in", label: "In", valueType: "any", required: false }], outputs: [{ id: "success", label: "Success", valueType: "any" }],
  parameters: [{ id: "target", label: "Target", valueType: "object", required: false }, { id: "url", label: "Address", valueType: "string", required: false }],
  safety: { requiredPermissions: [] }
};
const OPEN: AutomationStudioNodeDefinition = { ...PRESS, id: OPEN_ID, label: "Open", description: "Open", source: { ...PRESS.source, implementationKey: OPEN_ID } as AutomationStudioNodeDefinition["source"] };
const edge = (id: string, sourceNodeId: string, sourcePortId: string, targetNodeId: string): AutomationStudioFlowEdge => ({ id, sourceNodeId, sourcePortId, targetNodeId, targetPortId: "in" });
const start = (id: string): AutomationStudioFlowNode => ({ id, definitionId: "builtin.control.start", definitionVersion: "1.0.0", label: "Start" });

type Offered = Parameters<typeof automationStudioAnswerFirstKnownParts>[0];

describe("a part an attempt ran, to the Flow it leaves", () => {
  let dataDir = "";
  let service: AutomationStudioService;
  let presses = 0;
  let modelCalls = 0;
  let projectId = "";

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-draft-to-flow-"));
    presses = 0;
    modelCalls = 0;
    const native = new AutomationStudioNativeNodeRuntime({ permissions: [], runtimeCapabilities: ["example.actions"] }).register({
      schemaVersion: "0.1", sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, packageId: "example.package", packageVersion: "1.0.0", domainId: "example", nodes: [PRESS, OPEN]
    }, {
      packageId: "example.package", packageVersion: "1.0.0",
      implementations: {
        [PRESS_ID]: () => {
          presses += 1;
          return { status: "success", route: "success", outputs: { success: true } };
        },
        [OPEN_ID]: () => ({ status: "success", route: "success", outputs: { success: true } })
      }
    });
    service = new AutomationStudioService({
      dataDir,
      llmProviderResolver: () => {
        modelCalls += 1;
        throw new Error("no model is called here");
      },
      llmEvidenceRuntime: { domainId: "example", deniedEvidenceKeys: [], resolvePlanNodeParameters: ({ parameters }) => ({ status: "resolved", parameters }), tools: [], executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: {}, effectApplied: false, targetsUnchanged: true }) }
    });
    service.bindNativeNodeRuntime(native);
    service.bindHostRuntime({ capabilities: ["fact-evaluation"], factEvaluator: (conditions) => conditions.map(() => ({ result: "true" as const, capturedAt: 1 })) });
    projectId = (await service.createProject({ name: "Draft to Flow", domainId: "example" })).id;
  });
  afterEach(async () => {
    await service.close();
    await rm(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  });

  /** A part of one lasting press, kept in the library from a Flow of its own. */
  const savedPart = async () => {
    const source = await service.createFlow({ projectId, flowId: "flow.source", name: "Source" });
    const subflow = await service.createFlowSubflow({ projectId, flowId: source.flowId, name: "Keep it", role: "utility" });
    const graph = await service.getFlow(projectId, subflow.graphFlowId!);
    await service.saveFlow({ projectId, flow: { ...graph, nodes: [start("keep.start"), { id: "keep.press", definitionId: PRESS_ID, definitionVersion: "1.0.0", label: "Press", parameterValues: { target: { selector: "#keep" } }, metadata: { declaredConsequences: ["create_new"] } }], edges: [edge("keep.1", "keep.start", "success", "keep.press")] } });
    // A part says the site of the Flow it came from, which another of its graphs opens.
    const open = await service.createFlowSubflow({ projectId, flowId: source.flowId, name: "Open the site", role: "utility" });
    const openGraph = await service.getFlow(projectId, open.graphFlowId!);
    await service.saveFlow({ projectId, flow: { ...openGraph, nodes: [start("open.start"), { id: "open.go", definitionId: OPEN_ID, definitionVersion: "1.0.0", label: "Open", parameterValues: { url: "https://list.example/start" }, metadata: { declaredConsequences: [] } }], edges: [edge("open.1", "open.start", "success", "open.go")] } });
    const kept = await service.projectParts.save({ projectId, flowId: source.flowId, subflowId: subflow.subflowId, name: "Keep it", purpose: "Keep the one thing" });
    if (!("saved" in kept) || !kept.saved) throw new Error(JSON.stringify(kept));
    return { partId: kept.partId, version: kept.version };
  };

  const builtFlow = async () => {
    await service.createFlow({ projectId, flowId: BUILT, name: "Built" });
    const instruction = await service.saveFlowGenerationInstruction({ projectId, flowId: BUILT, instruction: "Keep the one thing." });
    return { instructionIds: [(instruction as { instructionId: string }).instructionId] };
  };

  const actStore = () => {
    const owned = service as unknown as { projectPaths: AutomationStudioProjectPaths; flowPaths: AutomationStudioFlowPaths; projects: Parameters<typeof automationStudioAnswerFirstRunActStoreOf>[1]["projects"] };
    return automationStudioAnswerFirstRunActStoreOf(service, { paths: owned.projectPaths, flows: owned.flowPaths, projects: owned.projects });
  };

  /** The attempt: the real tool through the real offer, telling the real record, persisted where a real run takes it from. */
  const attemptRan = async (partId: string): Promise<AutomationStudioFlowDraftStep> => {
    const store = actStore();
    const record = new AutomationStudioAttemptActRecord({ persist: (data) => store.save(projectId, BUILT, data) });
    const base = (): AutomationStudioHarnessOptionLoopBinding => ({ tools: [], executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: false, targetsUnchanged: true }) });
    const parent = await service.getFlow(projectId, BUILT);
    const { resolution } = automationStudioServiceRegistryResolution(nativeOf(service), parent.scope);
    const offer: Offered = await automationStudioAnswerFirstKnownParts<Offered>({
      projectId, flowId: BUILT, instructionText: "Keep the one thing.", startLocation: undefined, resolution,
      parts: { shortlist: async () => ({ note: "n", parts: [{ partId, version: 1 }] }) as unknown as AutomationStudioKnownParts, runAs: (input) => service.projectParts.runAs(input) },
      permissionGround: { permittedConsequences: ["create_new"] }, harnessOptions: base(), continuingOptions: base
    });
    offer.partActs!.use(record);
    const value = { partId } as JsonObject;
    const answer = await offer.harnessOptions.executeTool({ callId: "call.part", toolId: AUTOMATION_STUDIO_LLM_RUN_PART_TOOL_ID, value }) as AutomationStudioLlmEvidenceToolExecutionResult;
    expect(answer.evidence, JSON.stringify(answer.evidence)).toMatchObject({ ok: true, status: "succeeded", acts: ["create_new"] });
    await record.flushed();
    expect(record.acts().map((act) => act.state)).toEqual(["landed"]);
    return { id: "d1", position: 1, iteration: 1, callId: "call.part", toolId: AUTOMATION_STUDIO_LLM_RUN_PART_TOOL_ID, actionId: answer.draft!.actionId, input: value, ranWith: answer.draft!.ranWith, effect: answer.draft!.effect, effectApplied: true, disposition: "kept" } as AutomationStudioFlowDraftStep;
  };

  const completed = async (step: AutomationStudioFlowDraftStep) => {
    const parent = await service.getFlow(projectId, BUILT);
    const { registry, resolution } = automationStudioServiceRegistryResolution(nativeOf(service), parent.scope);
    const verdict = await checkAutomationStudioFlowBootstrapCompletion({
      result: { summary: "Keep the one thing" }, projectId, flowId: BUILT, registry, resolution, draftSteps: [step], instructionText: "Keep the one thing.",
      permissionFor: () => async () => ({ permitted: true, missing: [], requestId: null })
    });
    if (!verdict.ok) throw new Error(JSON.stringify(verdict));
    return verdict;
  };

  const run = async () => await service.runRuntimeSession({ projectId, flowId: BUILT, inputs: {}, adaptiveMode: "no_llm_intervention", authorizedDomainIds: ["example"], permittedConsequences: ["create_new"], authorizedExternalSideEffects: true });

  it("assembles, saves and applies to a Flow pinning the version, its first real run does not repeat the act, and it is one caller", async () => {
    const pin = await savedPart();
    const { instructionIds } = await builtFlow();
    const step = await attemptRan(pin.partId);
    expect(presses, "the attempt pressed once").toBe(1);
    const verdict = await completed(step);

    // An attempt's draft: its graphs under ids of its own, kept in the library.
    const draft = await service.projectParts.saveDraft({ projectId, flowId: BUILT, candidateId: "candidate.one", buildPlan: verdict.buildPlan, instructionIds, instructionText: "Keep the one thing." });
    expect(draft?.failed).toBeUndefined();
    const callerRows = async () => (await service.projectParts.get({ projectId, partId: pin.partId }) as GetProjectPartResponse).callers;
    expect(await callerRows(), "the draft is the Flow's").toMatchObject([{ kind: "flow", flowId: BUILT, version: pin.version }]);

    const adaptation = await service.createFlowBootstrapAdaptation({ projectId, flowId: BUILT, baseDependencyDigest: await service.getLlmExecutionDependencyDigest(projectId, BUILT), sourceInstructionIds: instructionIds, summary: verdict.summary, buildPlan: verdict.buildPlan });
    await service.reviewFlowBootstrapAdaptation({ projectId, flowId: BUILT, adaptationId: adaptation.adaptationId, action: "approve", actorId: "user.test" });
    await service.reviewFlowBootstrapAdaptation({ projectId, flowId: BUILT, adaptationId: adaptation.adaptationId, action: "apply", actorId: "user.test" });

    const summaries = await service.listFlowSubflowSummaries({ projectId, flowId: BUILT, limit: 10, offset: 0 });
    const subflows = (await Promise.all(summaries.subflows.map((item) => service.getFlowSubflow(projectId, BUILT, item.subflowId)))).filter((item) => item !== null);
    const graphs = await Promise.all(subflows.map((subflow) => service.getFlow(projectId, subflow.graphFlowId!)));
    const calls = graphs.flatMap((graph) => graph.nodes).filter((node) => node.definitionId === CALL);
    expect(calls.map((node) => node.parameterValues?.part), "one pinned Call Subflow").toEqual([pin]);
    expect(calls[0]!.parameterValues, "naming no Subflow").not.toHaveProperty("subflowId");

    // Stale draft rows and the applied graph's own: the Flow is one caller, and finds the part once.
    expect(await callerRows()).toHaveLength(1);
    expect((await service.projectParts.list({ projectId, usedByFlowId: BUILT }) as ListProjectPartsResponse).parts.map((card) => card.partId)).toEqual([pin.partId]);

    const first = await run();
    expect(first.status, JSON.stringify(first.trace?.message ?? first.trace?.failure ?? null)).toBe("succeeded");
    expect(presses, "the first real run did not press again").toBe(1);
    const second = await run();
    expect(second.status).toBe("succeeded");
    expect(presses, "a second, deliberate run does: the check above is not empty").toBe(2);
    expect(modelCalls).toBe(0);
  });

  it("a candidate trial of that plan runs the pinned version with no model, and says what it left, through a host's own trial ports", async () => {
    const pin = await savedPart();
    const { instructionIds } = await builtFlow();
    const verdict = await completed(await attemptRan(pin.partId));
    presses = 0;
    let judged = 0;
    const ports = await automationStudioServiceWholeTrialPorts(service, { projectId, flowId: BUILT, sourceInstructionIds: instructionIds, judge: async () => {
      judged += 1;
      return { verdict: "yes", spent: { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0, calls: 0 } };
    } });
    const baseDependencyDigest = await service.getLlmExecutionDependencyDigest(projectId, BUILT);
    const digest = "c".repeat(64);
    const candidate = { revision: 1, digest, baseDependencyDigest, status: "draft" as const, summary: verdict.summary, buildPlan: verdict.buildPlan, changedPaths: ["plan"] };
    const outcome = await runAutomationStudioCandidateTrial({ candidateId: "candidate.trial", revision: 1, digest, signal: new AbortController().signal, candidate }, ports);
    expect(outcome.record, JSON.stringify(outcome.record)).toMatchObject({ verdict: "yes", execution: "succeeded" });
    expect(presses, "the pinned version's press ran").toBe(1);
    expect(judged, "the judge is this test's own").toBe(1);
    expect(modelCalls).toBe(0);
    expect(outcome.result?.acts?.map((act) => act.consequences), "its act is attributed through the pinned frame").toEqual([["create_new"]]);
  });

  it("the same trial with a version not in the library fails its call with the closed code, and presses nothing", async () => {
    const pin = await savedPart();
    const { instructionIds } = await builtFlow();
    const verdict = await completed(await attemptRan(pin.partId));
    presses = 0;
    const plan = structuredClone(verdict.buildPlan);
    const call = plan.plan.subflows.flatMap((subflow) => subflow.nodes).find((node) => node.definitionId === CALL)!;
    call.parameters = { part: { partId: pin.partId, version: 99 }, inputs: {} };
    for (const subflow of plan.subflows) for (const node of subflow.nodes) if (node.definitionId === CALL) node.parameters = call.parameters;
    const ports = await automationStudioServiceWholeTrialPorts(service, { projectId, flowId: BUILT, sourceInstructionIds: instructionIds, judge: async () => { throw new Error("a failed trial is not judged"); } });
    const digest = "d".repeat(64);
    const candidate = { revision: 1, digest, baseDependencyDigest: await service.getLlmExecutionDependencyDigest(projectId, BUILT), status: "draft" as const, summary: verdict.summary, buildPlan: plan, changedPaths: ["plan"] };
    const outcome = await runAutomationStudioCandidateTrial({ candidateId: "candidate.gone", revision: 1, digest, signal: new AbortController().signal, candidate }, ports);
    expect(outcome.record.execution).toBe("failed");
    expect(presses).toBe(0);
    expect(JSON.stringify(outcome.result)).toContain("part_version_missing");
  });
});

function nativeOf(service: AutomationStudioService): AutomationStudioNativeNodeRuntime {
  return (service as unknown as { nativeNodeRuntime: AutomationStudioNativeNodeRuntime }).nativeNodeRuntime;
}
