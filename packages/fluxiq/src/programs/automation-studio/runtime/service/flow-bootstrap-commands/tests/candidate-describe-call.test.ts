// A candidate build's exploration cards name the control each call is about
// (t378): the service gave the legacy round the bound domain's `describeCall`
// and the candidate loop none, so the candidate build's cards named no control.
// Through the actual service.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { activityActionOf } from "../../../../../../ui/index.ts";
import { automationStudioActivityHub } from "../../../activity/index.ts";
import { AutomationStudioService } from "../../../service.ts";
import { blankFixture, caller, judgeReply, mockProvider } from "../../../tests/service-bootstrap/tests/fixtures.ts";

describe("a candidate build's exploration in the chat", () => {
  it("asks the bound domain to describe each call, so its card names the control", async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-candidate-describe-call-"));
    let decisions = 0;
    const provider = mockProvider(async (request) => {
      if (request.taskKind === "loop_verification") return judgeReply("no");
      decisions++;
      const decision = decisions === 1 ? { kind: "tool_call", callId: "look", toolId: "web.output.dom-click", input: { target: { handle: "t12" } } }
        : { kind: "tool_call", callId: `submit-${decisions}`, toolId: "core.submit_candidate", input: { summary: "nothing yet", plan: { schemaVersion: "0.1" } } };
      return { response: { kind: "evidence_tool_decision", summary: "Scripted", decision }, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.001 } };
    });
    const described: Array<{ projectId: string; flowId: string; toolId: string }> = [];
    const service = new AutomationStudioService({ dataDir, llmProviderResolver: () => ({ provider, maxCallsPerRun: 12, maxEstimatedCostUsd: 0.1 }),
      llmEvidenceRuntime: { domainId: "isolated", deniedEvidenceKeys: [], tools: [{ toolId: "web.output.dom-click", description: "Click", inputSchema: { type: "object" }, effect: "observe" }],
        executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { seen: true }, effectApplied: false, targetsUnchanged: true }),
        describeCall: (call) => { described.push({ projectId: call.projectId, flowId: call.flowId, toolId: call.toolId }); return call.toolId === "web.output.dom-click" ? { target: "Add to cart" } : undefined; } } });
    const events: ClientGatewayActivity[] = [];
    const unsubscribe = automationStudioActivityHub.subscribe((event) => { if (event.subject.kind === "build") events.push(event); });
    try {
      const { project, flow } = await blankFixture(service);
      await service.generateFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, caller: caller(), evidenceGuided: true, authoringMode: "candidate" }).catch(() => undefined);
      expect(described).toContainEqual({ projectId: project.id, flowId: flow.flowId, toolId: "web.output.dom-click" });
      const looked = events.filter((event) => event.detail?.kind === "tool" && activityActionOf(event)?.target === "Add to cart");
      expect(looked.length).toBeGreaterThan(0);
    } finally {
      unsubscribe();
      await service.close();
      await rm(dataDir, { recursive: true, force: true });
    }
  }, 60_000);
});
