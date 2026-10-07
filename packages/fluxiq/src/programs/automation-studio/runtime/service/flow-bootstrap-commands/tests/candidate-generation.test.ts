import { mkdtemp, rm, realpath } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { AutomationStudioService } from "../../../service.ts";
import { AutomationStudioFlowCandidateDraftStore, type AutomationStudioFlowCandidateDraftRecord } from "../../candidate-drafts/index.ts";
import { blankFixture, caller, mockProvider, plan } from "../../../tests/service-bootstrap/tests/fixtures.ts";

function draftStore(service: AutomationStudioService) { return (service as unknown as { candidateDrafts: AutomationStudioFlowCandidateDraftStore }).candidateDrafts; }

describe("candidate facade uses the actual service", () => {
  it.each(["draft", "stale", "cancel", "save_failure"] as const)("discovery and full submissions end as %s without proposing or applying", async (ending) => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-candidate-facade-"));
    let calls = 0, discoveries = 0, stale = false;
    let service!: AutomationStudioService, projectId = "", flowId = "";
    const requests: string[] = [];
    const provider = mockProvider(async (request) => {
      requests.push(request.taskKind); calls++;
      expect(request.taskKind).toBe("evidence_tool_decision");
      const evidence = request.context.evidenceLoop?.evidence ?? [];
      const latest = [...evidence].reverse().find((entry) => entry.toolId === "core.submit_candidate")?.value as { revision?: number; digest?: string } | undefined;
      const decision = calls === 1 ? { kind: "tool_call", callId: "wrong-turn", toolId: "inspect", input: { area: "wrong" } }
        : calls < 4 ? { kind: "tool_call", callId: `submit-${calls}`, toolId: "core.submit_candidate", input: { summary: `complete revision ${calls - 1}`, plan: plan() } }
        : { kind: "complete", result: { revision: latest?.revision, digest: latest?.digest } };
      if (calls === 4) { stale = ending === "stale"; if (ending === "cancel") service.buildCancellation.cancel(projectId, flowId); }
      return { response: { kind: "evidence_tool_decision", summary: "Scripted candidate authoring", decision }, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.001 } };
    });
    service = new AutomationStudioService({ dataDir, llmProviderResolver: () => ({ provider, maxCallsPerRun: 12, maxEstimatedCostUsd: 0.1 }),
      llmEvidenceRuntime: { domainId: "isolated", deniedEvidenceKeys: [], tools: [{ toolId: "inspect", description: "Inspect", inputSchema: { type: "object" }, effect: "observe" }], executeTool: async () => {
        discoveries++; return { kind: "llm_evidence_tool_execution", evidence: { area: "wrong", unrelated: true }, effectApplied: false, targetsUnchanged: true };
      } }
    });
    try {
      const { project, flow } = await blankFixture(service); projectId = project.id; flowId = flow.flowId;
      const before = await service.getFlow(projectId, flowId), proposed = vi.spyOn(service, "createFlowBootstrapAdaptation");
      const readBinding = service.getLlmExecutionBinding.bind(service);
      vi.spyOn(service, "getLlmExecutionBinding").mockImplementation(async (p, f) => { const binding = await readBinding(p, f); return stale ? { ...binding, settingsRevision: binding.settingsRevision + 1 } : binding; });
      if (ending === "save_failure") vi.spyOn(draftStore(service), "save").mockRejectedValue(new Error("synthetic disk failure"));
      const building = service.generateFlowBootstrapAdaptation({ projectId, flowId, caller: caller(), evidenceGuided: true, authoringMode: "candidate" });
      if (ending === "draft") {
        const result = await building;
        expect(result).toMatchObject({ status: "draft", revision: 2, verification: "not_performed", promotionAllowed: false, accounting: { inputTokens: 40, outputTokens: 20, totalTokens: 60, estimatedCostUsd: 0.004 } });
        expect(result).not.toHaveProperty("adaptationId");
        const saved = await draftStore(service).get(projectId, flowId);
        expect(saved).toMatchObject({ candidateId: result.candidateId, sourceInstructionIds: ["instruction.build"], instructionText: "Build a primary path\nCreate a deterministic Start to End Flow.", candidate: { revision: 2, digest: result.digest, status: "draft" } });
        expect(saved?.candidate.buildPlan.subflows[0]?.nodes.map((node) => node.definitionId)).toEqual(["builtin.control.start", "builtin.control.end"]);
        expect(JSON.stringify(saved)).not.toContain("unrelated"); expect(JSON.stringify(saved)).not.toContain("wrong-turn");
        const spend = await (service as any).creationSpends.get(projectId, flowId); expect(spend).toMatchObject({ builds: 1, spentUsd: 0.004 });
        const restarted = new AutomationStudioService({ dataDir });
        try { expect(await draftStore(restarted).get(projectId, flowId)).toEqual(saved); } finally { await restarted.close(); }
      } else if (ending === "cancel") {
        await expect(building).rejects.toMatchObject({ name: "AbortError", cause: { diagnostic: { accounting: { estimatedCostUsd: 0.004, totalTokens: 60 } } } });
      } else {
        await expect(building).rejects.toMatchObject({ diagnostic: { stage: ending === "stale" ? "post_provider_validation" : "persistence", accounting: { estimatedCostUsd: 0.004, totalTokens: 60 } } });
      }
      if (ending !== "draft") expect(await draftStore(service).get(projectId, flowId)).toBeUndefined();
      expect(calls).toBe(4); expect(discoveries).toBe(1); expect(proposed).not.toHaveBeenCalled();
      expect(await (service as any).bootstrapAdaptations.listFlowBootstrapAdaptations(projectId, flowId)).toEqual([]);
      expect(await service.getFlow(projectId, flowId)).toEqual(before);
      expect(await service.getFlowRouter(projectId, flowId)).toBeNull();
      expect(requests).not.toContain("loop_verification");
    } finally { await service.close(); await rm(dataDir, { recursive: true, force: true }); }
  }, 60_000);
});


// Real helper pipeline with deterministic provider-free harness, not facade wiring.
import { generateAutomationStudioFlowCandidateDraft } from "../candidate-generation.ts";
import { automationStudioFlowBootstrapGenerationContext } from "../generation-context.ts";
import { candidateSourceFixture as sourceFixture } from "../../candidate-drafts/tests/fixtures.ts";
import { AutomationStudioCandidateSource } from "../../candidate-drafts/index.ts";
import { AutomationStudioProjectPaths, AutomationStudioFlowPaths } from "../../paths/index.ts";
import type { AutomationStudioProjectStore } from "../../projects/index.ts";
import { AutomationStudioNodeRegistry } from "../../../../nodes/index.ts";
import type { AutomationStudioFlowArtifact } from "../../../../model/index.ts";
import { runAutomationStudioLlmHarness } from "../../../llm/index.ts";

function boundGeneration(store: Pick<AutomationStudioFlowCandidateDraftStore, "save">) {
  const registry = new AutomationStudioNodeRegistry(), resolution = { scope: { kind: "domain" as const, domainId: "isolated" }, permissions: [], runtimeCapabilities: [] };
  const context = automationStudioFlowBootstrapGenerationContext({ projectId: "project.1", flowId: "flow.1", instructions: [sourceFixture.instruction()], registry, resolution,
    parent: { flowId: "flow.1", projectId: "project.1" } as AutomationStudioFlowArtifact, originalInstructionInventory: { instructionIds: ["instruction.original"] } });
  if (context.originalSource.status !== "bound") throw new Error("Missing bound context fixture");
  const binding = context.originalSource.binding;
  let calls = 0;
  const provider = mockProvider(async request => {
    calls++;
    const latest = [...(request.context.evidenceLoop?.evidence ?? [])].reverse().find(entry => entry.toolId === "core.submit_candidate")?.value as { revision: number; digest: string } | undefined;
    return { response: { kind: "evidence_tool_decision", summary: "Synthetic authoring", decision: calls === 1
      ? { kind: "tool_call", callId: "submit", toolId: "core.submit_candidate", input: { summary: "Original candidate", plan: plan() } }
      : { kind: "complete", result: { revision: latest?.revision, digest: latest?.digest } } }, usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5, estimatedCostUsd: 0.001 } };
  });
  const input: Parameters<typeof generateAutomationStudioFlowCandidateDraft>[0] = {
    submission: { projectId: "project.1", flowId: "flow.1", registry, resolution, baseDependencyDigest: "base", instructionText: context.bootstrapInstructionText, originalSource: binding },
    originalSource: binding, sourceInstructionIds: [...binding.originalSources.effectiveInstructionIds], baseSettingsRevision: 1,
    loop: { propagateDecisionErrors: true, tools: [], maxIterations: 3, maxToolCalls: 2, executeTool: async () => { throw new Error("No discovery/effect expected"); } },
    harness: { projectId: "project.1", flowId: "flow.1", instructions: [sourceFixture.instruction()], provider, deniedEvidenceKeys: [] }, runHarness: runAutomationStudioLlmHarness,
    wrapDecision: decide => decide, beforeDecision: () => undefined, progress: () => undefined, ending: () => undefined,
    authorityUsage: { calls: 0, estimatedInputTokens: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
    currentBinding: async () => ({ executionDigest: "base", settingsRevision: 1 }), store
  };
  return { input, calls: () => calls };
}

it("actual context/submission/generator persist original v2 fields and survive a new disk store", async () => {
  const parent = await realpath(os.tmpdir()), root = await mkdtemp(path.join(parent, "fluxiq-bound-generator-"));
  try {
    const paths = new AutomationStudioProjectPaths(path.join(root, "programs", "automation-studio", "projects")), flows = new AutomationStudioFlowPaths(paths);
    const projects = { ensureProjectStructure: async () => undefined } as unknown as AutomationStudioProjectStore;
    const store = new AutomationStudioFlowCandidateDraftStore(paths, flows, projects), build = boundGeneration(store);
    const record = await generateAutomationStudioFlowCandidateDraft(build.input);
    expect(record.schemaVersion).toBe(2);
    expect(record.candidate).toMatchObject({ fingerprintVersion: "candidate.plan+original_sources.v2", originalInstructionsDigest: build.input.originalSource!.originalInstructionsDigest });
    if (record.schemaVersion !== 2) throw new Error("Unexpected legacy record");
    expect(record.originalSources.instructions).toEqual([sourceFixture.instruction()]);
    expect(record.instructionText).toBe(AutomationStudioCandidateSource.text(build.input.originalSource!));
    expect(record.accounting).toMatchObject({ inputTokens: 6, outputTokens: 4, totalTokens: 10, estimatedCostUsd: 0.002 });
    expect(build.calls()).toBe(2);
    const restarted = new AutomationStudioFlowCandidateDraftStore(paths, flows, projects);
    expect(await restarted.getVerificationSource({ reference: sourceFixture.reference(record), currentOriginalSources: record.originalSources })).toMatchObject({ status: "bound", record });
    expect(record).not.toHaveProperty("requirements"); expect(record.verification).toBe("not_performed");
  } finally {
    const target = await realpath(root); expect(path.dirname(target)).toBe(parent); expect(path.basename(target)).toMatch(/^fluxiq-bound-generator-/);
    await rm(target, { recursive: true, force: true });
  }
});

it.each(["digest", "ids", "submission", "undefined", "getter"] as const)("supplied %s source refuses before provider/save", async kind => {
  const save = vi.fn(async (record: AutomationStudioFlowCandidateDraftRecord) => record), build = boundGeneration({ save });
  if (kind === "digest") build.input.originalSource = { ...build.input.originalSource!, originalInstructionsDigest: "b".repeat(64) };
  if (kind === "ids") build.input.sourceInstructionIds = ["borrowed"];
  if (kind === "submission") delete build.input.submission.originalSource;
  if (kind === "undefined") Object.defineProperty(build.input, "originalSource", { value: undefined });
  let getters = 0;
  if (kind === "getter") Object.defineProperty(build.input, "originalSource", { get: () => { getters++; return sourceFixture.binding(); } });
  await expect(generateAutomationStudioFlowCandidateDraft(build.input)).rejects.toThrow();
  expect(build.calls()).toBe(0); expect(save).not.toHaveBeenCalled(); expect(getters).toBe(0);
});
