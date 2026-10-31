// @fluxiq-test-group real-sql
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../native-node-runtime.ts";
import { AutomationStudioService } from "../../../service.ts";
import { blankFixture, caller, mockProvider } from "../../../tests/service-bootstrap/tests/fixtures.ts";
import * as loops from "../../evidence-loop.ts";

function native() {
  const definition: AutomationStudioNodeDefinition = {
    schemaVersion: "0.1", id: "isolated.read", version: "1.0.0", label: "Read", description: "Read current facts.", category: "data",
    source: { kind: "importer", domainId: "isolated", packageId: "isolated.reads", implementationKey: "read" }, availability: { kind: "domain", domainId: "isolated" },
    capabilities: { executable: true, codeBacked: true }, actionEffect: { effectClass: "observe" }, inputs: [], outputs: [], parameters: []
  };
  return new AutomationStudioNativeNodeRuntime().register({ schemaVersion: "0.1", sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, packageId: "isolated.reads", packageVersion: "1.0.0", domainId: "isolated", nodes: [definition] }, {
    packageId: "isolated.reads", packageVersion: "1.0.0", implementations: { read: () => ({ status: "success", route: "done", outputs: {} }) }
  });
}

describe("actual service startup passes canonical runtime authority", () => {
  it.each(["candidate", "project"] as const)("wires the %s authoring loop, with its actual permission scope", async (mode) => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-prior-call-wiring-"));
    let supervisorDecisions = 0, projectId = "", flowId = "";
    const provider = mockProvider(async (request) => {
      const tools = request.context.evidenceLoop?.tools.map((tool) => tool.toolId) ?? [];
      const decision = tools.includes("project.write_plan")
        ? ++supervisorDecisions === 1
          ? { kind: "tool_call", callId: "plan", toolId: "project.write_plan", input: {
            taskSpec: { parts: [{ id: "p1", quote: { sourceId: "instruction.build", text: "Create a deterministic Start to End Flow." }, goalFacts: ["The Flow runs from its start to its end"], lastingActs: [] }], notAsked: [] },
            subflows: [{ key: "main", name: "Main", parts: ["p1"] }]
          } }
          : { kind: "tool_call", callId: "dispatch", toolId: "project.dispatch", input: { reason: "Build the requested subflow.", briefs: [{ kind: "build", subflowKey: "main", parts: ["p1"], entry: { caseId: "observed-current", predecessors: [] }, permittedActs: [], allowanceUsd: 0.02, maxIterations: 6 }] } }
        : { kind: "complete", result: {} };
      return { response: { kind: "evidence_tool_decision", summary: "Deterministic wiring probe", decision }, usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12, estimatedCostUsd: 0.0001 } };
    });
    const service = new AutomationStudioService({ dataDir, llmProviderResolver: () => ({ provider, maxCallsPerRun: 16, maxEstimatedCostUsd: 0.1 }),
      llmEvidenceRuntime: { domainId: "isolated", deniedEvidenceKeys: [], tools: [{ toolId: "inspect", description: "Read current facts.", effect: "observe", inputSchema: { type: "object" } }],
        executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: false }) }
    }).bindNativeNodeRuntime(native());
    const actual = loops.runAutomationStudioLlmEvidenceLoop;
    const probes: unknown[] = [];
    const observed = vi.spyOn(loops, "runAutomationStudioLlmEvidenceLoop").mockImplementation(async (input) => {
      const target = mode === "candidate" ? input.tools.some((tool) => tool.toolId === "core.submit_candidate") : input.finishingTools?.submit === "core.submit_subflow";
      if (!target) return actual(input);
      const authority = input.rerunAuthority;
      probes.push({ scope: authority?.currentScope(), resolved: authority?.resolve("isolated.read", {}, {}), unknown: authority?.resolve("isolated.missing", {}, {}) });
      service.buildCancellation.cancel(projectId, flowId);
      throw new Error("loop wiring observed");
    });
    try {
      const fixture = await blankFixture(service, "active", "isolated");
      projectId = fixture.project.id;
      flowId = fixture.flow.flowId;
      await service.generateFlowBootstrapAdaptation({ projectId, flowId, caller: caller(), evidenceGuided: true, authoringMode: mode }).catch(() => undefined);
      expect(probes).toHaveLength(1);
      expect(probes[0]).toMatchObject({ scope: { binding: expect.any(Object), generation: expect.any(Object), registry: expect.any(Object), authority: expect.any(Object) }, resolved: { definitionId: "isolated.read", definitionVersion: "1.0.0", effect: { effectClass: "observe" } }, unknown: undefined });
    } finally {
      observed.mockRestore();
      await service.close();
      await rm(dataDir, { recursive: true, force: true });
    }
  }, 120_000);
});
