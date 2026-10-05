import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding } from "../../../llm/index.ts";
import { AutomationStudioNativeNodeRuntime, AutomationStudioService } from "../../../index.ts";
import { blankFixture, caller, expectNoTopology, isJudgeRequest, judgeReply, mockProvider, rejectedGenerationDiagnostic } from "../../service-bootstrap/index.ts";

it("forwards the bound domain declaration into actual model-facing rerun diagnostics", async () => {
  const nodeId = "domain.example.read";
  const notes: JsonObject[] = [];
  const decisions: JsonObject[] = [
    { kind: "tool_call", callId: "baseline", toolId: "core.run_node", input: { node: nodeId, parameters: { listing: { good: true } }, consequences: [] }, add: true },
    { kind: "tool_call", callId: "bad-read", toolId: "core.run_node", input: { node: nodeId, parameters: { listing: { misplaced: 1, hostPrivate: "synthetic private", paginate: { pages: 1 } } }, consequences: [] } },
    { kind: "amend_draft", amendments: [{ step: 3, change: "rerun", input: { listing: { paginate: { pages: 5 } } } }] }
  ];
  const usage = { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCostUsd: 0.001 };
  const provider = mockProvider(async (request) => {
    if (request.metadata?.source === "instructionAuthority") return { response: { kind: "evidence_tool_decision", decision: { kind: "complete", result: { instructed: [] } } }, usage };
    if (isJudgeRequest(request)) return judgeReply("yes");
    notes.push(...notesIn(request));
    const decision = decisions.shift();
    if (!decision) throw new Error("Unexpected additional synthetic model decision");
    return { response: { kind: "evidence_tool_decision", summary: "Build.", decision }, usage };
  });
  const binding: AutomationStudioLlmEvidenceRuntimeBinding = {
    domainId: "example", deniedEvidenceKeys: ["hostPrivate"], runsNodes: {},
    tools: [{ toolId: "example.look", description: "Look.", inputSchema: { type: "object" }, effect: "observe", initialObservation: { input: {} } }],
    executeTool: async ({ toolId, value }) => {
      if (toolId === "example.look") return { kind: "llm_evidence_tool_execution", evidence: { looked: true }, effectApplied: false };
      if (value.replay) return { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true, resultCode: "core.replay.replayed" };
      const listing = (value.parameters as JsonObject).listing as JsonObject;
      const ok = !Object.hasOwn(listing, "misplaced");
      return { kind: "llm_evidence_tool_execution", evidence: { ok }, effectApplied: ok,
        draft: { actionId: nodeId, input: value, ranWith: value, effect: "observe", proposes: true } };
    }
  };
  const definition: AutomationStudioNodeDefinition = {
    schemaVersion: "0.1", id: nodeId, version: "1.0.0", label: "Read", description: "Synthetic read.", category: "action",
    source: { kind: "importer", domainId: "example", packageId: "example.package", implementationKey: nodeId }, availability: { kind: "domain", domainId: "example" },
    requiredRuntimeCapabilities: ["example.actions"], capabilities: { executable: true, codeBacked: true },
    inputs: [{ id: "in", label: "In", valueType: "any", required: false }], outputs: [{ id: "success", label: "Success", valueType: "any" }],
    parameters: [{ id: "listing", label: "Listing", valueType: "object", required: false }], outputAction: { fixedOutputId: nodeId }
  };
  const runtime = new AutomationStudioNativeNodeRuntime({ permissions: [], runtimeCapabilities: ["example.actions"] }).register({
    schemaVersion: "0.1", sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, packageId: "example.package", packageVersion: "1.0.0", domainId: "example", nodes: [definition]
  }, { packageId: "example.package", packageVersion: "1.0.0", implementations: { [nodeId]: () => ({ status: "success", route: "success", outputs: { success: true } }) } });
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-retained-argument-"));
  const service = new AutomationStudioService({ dataDir, llmProviderResolver: (() => ({ provider, maxCallsPerRun: 20, maxEstimatedCostUsd: 0.1 })) as never, llmEvidenceRuntime: binding });
  try {
    service.bindNativeNodeRuntime(runtime);
    const { project, flow } = await blankFixture(service, "active", "example");
    // The next actual model request is captured, then the script deliberately ends.
    const diagnostic = await rejectedGenerationDiagnostic(service.generateFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, evidenceGuided: true, caller: caller() }));
    expect(diagnostic.code).toBe("flow_bootstrap.provider_transport_unknown");
    expect(notes.some((note) => Array.isArray(note.kept) && note.kept.includes("listing.misplaced"))).toBe(true);
    expect(JSON.stringify(notes)).not.toContain("hostPrivate");
    expect(JSON.stringify(notes)).not.toContain("synthetic private");
    await expectNoTopology(service, project.id, flow.flowId);
  } finally {
    await service.close();
    await rm(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  }
}, 60_000);

/** Only synthetic diagnostic objects; assertions never print the whole model request. */
function notesIn(value: unknown): JsonObject[] {
  if (value === null || typeof value !== "object") return [];
  const object = value as Record<string, unknown>;
  if (object.code === "llm_evidence_loop.rerun_kept_keys") return [object as JsonObject];
  return Object.values(object).flatMap(notesIn);
}
