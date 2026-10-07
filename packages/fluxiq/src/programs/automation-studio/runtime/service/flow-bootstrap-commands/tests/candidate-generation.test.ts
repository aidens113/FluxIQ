import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { AutomationStudioService } from "../../../service.ts";
import type { AutomationStudioFlowCandidateDraftStore } from "../../candidate-drafts/index.ts";
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
