import { describe, expect, it } from "vitest";
import { AutomationStudioNodeRegistry } from "../../../../nodes/index.ts";
import {
  automationStudioFlowBootstrapCatalogNames,
  buildAutomationStudioFlowBootstrapContext,
  type AutomationStudioFlowBootstrapContext
} from "../../../flow-bootstrap/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../../flow-bootstrap/plan/tests/index.ts";
import { buildAutomationStudioLlmEvidenceLoopDecisionSchema } from "../../evidence-loop.ts";
import type { AutomationStudioLlmTaskRequest } from "../../harness.ts";
import { automationStudioDeepSeekOutputSchema } from "../output-schema.ts";
import { automationStudioDeepSeekMessages } from "../request-body.ts";
import { automationStudioDeepSeekRequestShape } from "../request-shape.ts";

// t235 (user, 2026-10-01): an evidence decision is shown the node catalog by
// name only, a note on how to read it, and the full definitions of only the
// nodes it asked `core.describe_nodes` about. The one-shot build is one call
// with no tools, so it cannot ask, and its payload is exactly what it was.

const registry = new AutomationStudioNodeRegistry(webDomainNodeDefinitionsFixture());
const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };
const catalogContext = buildAutomationStudioFlowBootstrapContext({ registry, resolution, startLocation: "https://shop.example.test/" });
const tools = [{ toolId: "core.run_node", description: "Run one node.", inputSchema: { type: "object" } }];
const completionSchema = { type: "object" };

describe("what an evidence decision is shown of the node catalog", () => {
  it("sends the names, the note and the described nodes, and neither the whole catalog nor its selection", () => {
    const described = [catalogContext.nodeCatalog[1]!, catalogContext.nodeCatalog[0]!];
    const sent = userPayload(evidenceRequest({ ...catalogContext, catalogNames: automationStudioFlowBootstrapCatalogNames(catalogContext.nodeCatalog), describedNodes: described }));
    const bootstrap = sent.context.flowBootstrap as Record<string, unknown>;

    expect(Object.keys(bootstrap)).toEqual(["startLocation", "startLocationNote", "nodeCatalog", "nodeCatalogNote", "describedNodes"]);
    expect(bootstrap.nodeCatalog).toEqual(automationStudioFlowBootstrapCatalogNames(catalogContext.nodeCatalog));
    expect(bootstrap.describedNodes).toEqual(described);
    const note = bootstrap.nodeCatalogNote as string;
    expect(note.length).toBeLessThanOrEqual(300);
    expect(note).toContain("core.describe_nodes");
    expect(note).toContain("describedNodes");
    // No entry of the whole catalog is on the wire beyond the two described.
    const wire = JSON.stringify(sent);
    expect(wire).not.toContain("catalogSelection");
    expect(wire).not.toContain("catalogTruncated");
    const undescribed = catalogContext.nodeCatalog.find((entry) => !described.includes(entry) && entry.parameters.length > 0)!;
    expect(wire).not.toContain(JSON.stringify(undescribed));
  });

  it("leaves describedNodes out until a node is described, and derives the names when the packet carries none", () => {
    const bootstrap = userPayload(evidenceRequest(catalogContext)).context.flowBootstrap as Record<string, unknown>;

    expect(Object.keys(bootstrap)).toEqual(["startLocation", "startLocationNote", "nodeCatalog", "nodeCatalogNote"]);
    expect(bootstrap.nodeCatalog).toEqual(automationStudioFlowBootstrapCatalogNames(catalogContext.nodeCatalog));
  });

  it("reports what it sent: the names and the described nodes, measured", () => {
    const described = [catalogContext.nodeCatalog[0]!];
    const names = automationStudioFlowBootstrapCatalogNames(catalogContext.nodeCatalog);
    const request = evidenceRequest({ ...catalogContext, catalogNames: names, describedNodes: described });
    const shape = automationStudioDeepSeekRequestShape({ request, model: "deepseek-flash", body: "{}" });

    expect(shape.catalog).toEqual({
      form: "names",
      entries: catalogContext.nodeCatalog.length,
      bytes: Buffer.byteLength(JSON.stringify(names), "utf8"),
      truncated: false,
      described: { entries: 1, bytes: Buffer.byteLength(JSON.stringify(described), "utf8") }
    });
  });
});

describe("what a one-shot build is shown of the node catalog", () => {
  it("is byte for byte the payload it was before the names-only catalog", () => {
    const request = oneShotRequest();
    const content = automationStudioDeepSeekMessages(request)[1]!.content;
    const sent = JSON.parse(content) as { context: { flowBootstrap: { startLocationNote: string } } };
    // The payload exactly as `providerUserPayload` built it before t235.
    const before = JSON.stringify({
      taskKind: request.taskKind,
      promptVersion: request.promptVersion,
      expectedOutput: request.expectedOutput,
      outputSchema: automationStudioDeepSeekOutputSchema(request),
      context: {
        schemaVersion: request.context.schemaVersion,
        projectId: request.context.projectId,
        flowId: request.context.flowId,
        instructions: request.context.instructions,
        flowBootstrap: {
          startLocation: catalogContext.startLocation,
          startLocationNote: sent.context.flowBootstrap.startLocationNote,
          nodeCatalog: catalogContext.nodeCatalog,
          catalogTruncated: catalogContext.catalogTruncated,
          catalogSelection: catalogContext.catalogSelection
        }
      }
    });

    expect(content).toBe(before);
    expect(automationStudioDeepSeekRequestShape({ request, model: "deepseek-flash", body: "{}" }).catalog).toEqual({
      form: "whole", entries: catalogContext.nodeCatalog.length, bytes: catalogContext.catalogSelection.usedBytes, truncated: false
    });
  });
});

function userPayload(request: AutomationStudioLlmTaskRequest): { context: Record<string, unknown> } {
  return JSON.parse(automationStudioDeepSeekMessages(request)[1]!.content) as { context: Record<string, unknown> };
}

function baseRequest(taskKind: "evidence_tool_decision" | "flow_bootstrap"): AutomationStudioLlmTaskRequest {
  const promptVersion = taskKind === "flow_bootstrap" ? "automation-studio.flow-bootstrap.v1" : "automation-studio.evidence-tool-decision.v1";
  return {
    requestId: "request.1",
    idempotencyKey: "request.1",
    timeoutMs: 20_000,
    estimatedInputTokens: 100,
    taskKind,
    promptVersion,
    expectedOutput: taskKind,
    tokenLimits: { maxInputTokens: 480_000, maxOutputTokens: 4_000, maxTotalTokens: 520_000 },
    maxEstimatedCostUsd: 0.25,
    deniedEvidenceKeys: [],
    context: {
      schemaVersion: "0.1",
      taskKind,
      promptVersion,
      projectId: "project.one",
      flowId: "flow.one",
      instructions: { instructions: [], instructionIds: [], diagnostics: [], tokenBudget: 8_000, estimatedTokens: 0 }
    }
  } as AutomationStudioLlmTaskRequest;
}

function evidenceRequest(flowBootstrap: AutomationStudioFlowBootstrapContext): AutomationStudioLlmTaskRequest {
  const request = baseRequest("evidence_tool_decision");
  return {
    ...request,
    context: {
      ...request.context,
      flowBootstrap,
      evidenceLoop: { iteration: 1, tools, evidence: [], decisionSchema: buildAutomationStudioLlmEvidenceLoopDecisionSchema(tools, completionSchema), completionSchema, canComplete: true }
    }
  };
}

function oneShotRequest(): AutomationStudioLlmTaskRequest {
  const request = baseRequest("flow_bootstrap");
  return { ...request, context: { ...request.context, flowBootstrap: catalogContext } };
}
