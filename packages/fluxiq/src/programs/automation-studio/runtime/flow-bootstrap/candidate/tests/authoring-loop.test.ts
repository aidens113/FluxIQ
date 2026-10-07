import { describe, expect, it } from "vitest";
import { AutomationStudioNodeRegistry, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import type { JsonObject } from "../../../../../../core/index.ts";
import { runAutomationStudioFlowCandidateAuthoringLoop, AutomationStudioFlowCandidateSubmissionController } from "../index.ts";

const definition: AutomationStudioNodeDefinition = {
  schemaVersion: "0.1", id: "domain.demo.inspect", version: "1.0.0", label: "Inspect", description: "Inspect one value", category: "action",
  source: { kind: "importer", domainId: "demo", implementationKey: "inspect" }, availability: { kind: "domain", domainId: "demo" }, capabilities: { executable: true },
  inputs: [{ id: "in", label: "In", valueType: "any" }], outputs: [{ id: "success", label: "Success", valueType: "any" }],
  parameters: [{ id: "text", label: "Text", valueType: "string", required: true }]
};
const registry = new AutomationStudioNodeRegistry([definition]);
const resolution = { scope: { kind: "domain" as const, domainId: "demo" }, runtimeCapabilities: [], permissions: [] };
function result(text = "reusable criterion"): JsonObject {
  return { summary: "Inspect selected values", plan: { schemaVersion: "0.1", router: { name: "Inspect", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } }, subflows: [{ key: "primary", name: "Primary", role: "primary", nodes: [
    { key: "first", definitionId: definition.id, definitionVersion: definition.version, parameters: { text } },
    { key: "second", definitionId: definition.id, definitionVersion: definition.version, parameters: { text: "read outcome" } }
  ], edges: [{ key: "next", source: { nodeKey: "first", portId: "success" }, target: { nodeKey: "second", portId: "in" } }] }] } };
}
const submission = { projectId: "project.test", flowId: "flow.test", registry, resolution, baseDependencyDigest: "accepted.base" };

describe("explicit candidate authoring", () => {
  it("records discovery evidence, omits a wrong turn, submits and revises without draft grammar", async () => {
    let receipt: JsonObject = {};
    const seen: string[] = [];
    const acceptedFlow = { graph: "unchanged" };
    const outcome = await runAutomationStudioFlowCandidateAuthoringLoop({ submission, loop: {
      tools: [{ toolId: "demo.explore", effect: "mutate", description: "Explore", inputSchema: { type: "object" } }], maxIterations: 6, maxToolCalls: 6,
      executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { wrongTurn: "irrelevant item" }, effectApplied: true }),
      decide: async ({ iteration, evidence, decisionSchema }) => {
        const schema = JSON.stringify(decisionSchema);
        expect(schema).not.toContain("amend_draft");
        expect(schema).not.toContain('"add"');
        seen.push(...evidence.map((entry) => entry.toolId));
        if (iteration === 1) return { kind: "tool_call", toolId: "demo.explore", callId: "wrong", input: {} };
        if (iteration === 2 || iteration === 3) return { kind: "tool_call", toolId: "core.submit_candidate", callId: `submit.${iteration}`, input: result(iteration === 2 ? "first criterion" : "reusable criterion") };
        receipt = [...evidence].reverse().find((entry) => entry.toolId === "core.submit_candidate")!.value as JsonObject;
        return { kind: "complete", result: { revision: receipt.revision, digest: receipt.digest } };
      }
    } });
    expect(outcome.loop.ok).toBe(true);
    expect(outcome.loop.steps).toEqual([]);
    expect(seen).toContain("demo.explore");
    expect(outcome.candidate).toMatchObject({ revision: 2, status: "draft" });
    expect(outcome.candidate?.changedPaths).toContain("plan.subflows.0.nodes.0.parameters.text");
    expect(JSON.stringify(outcome.candidate)).not.toContain("irrelevant item");
    expect(outcome.candidate?.buildPlan.plan.subflows[0]?.nodes).toHaveLength(2);
    expect(outcome.promotionAllowed).toBe(false);
    expect(acceptedFlow).toEqual({ graph: "unchanged" });
  });

  it("invalidates prior receipts on any submission, including a refused revision", async () => {
    const controller = new AutomationStudioFlowCandidateSubmissionController(submission);
    const first = await controller.submit(result());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(controller.matches(first.candidate)).toBe(true);
    const invalid = result();
    ((invalid.plan as JsonObject).subflows as JsonObject[])[0]!.nodes = [{ key: "unknown", definitionId: "missing.node", definitionVersion: "1.0.0" }];
    const refused = await controller.submit(invalid);
    expect(refused.ok).toBe(false);
    expect(controller.latest()).toBeUndefined();
    expect(controller.matches(first.candidate)).toBe(false);
    const next = await controller.submit(result());
    expect(next.ok && next.candidate.revision).toBe(3);
    expect(controller.matches(first.candidate)).toBe(false);
  });

  it("rejects stale and unresolved handles and collects registry/parameter diagnostics", async () => {
    const controller = new AutomationStudioFlowCandidateSubmissionController({ ...submission, binding: {
      resolvePlanNodeParameters: async ({ parameters }) => typeof parameters.text === "object" ? { status: "refused", issueCodes: ["target.handle_stale"] } : { status: "unchanged" }
    } });
    const candidate = result();
    const nodes = ((candidate.plan as JsonObject).subflows as JsonObject[])[0]!.nodes as JsonObject[];
    nodes[0]!.parameters = { text: { handle: "stale" } };
    const refused = await controller.submit(candidate);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.check.issueCodes.join(" ")).toContain("target.handle_stale");
  });

  it("cannot publish a candidate returned after cancellation", async () => {
    const abort = new AbortController();
    const controller = new AutomationStudioFlowCandidateSubmissionController({ ...submission, signal: abort.signal, binding: {
      resolvePlanNodeParameters: async () => { abort.abort(); return { status: "unchanged" }; }
    } });
    await expect(controller.submit(result())).rejects.toThrow();
    expect(controller.latest()).toBeUndefined();
  });
});

it("resolves issued handles to reusable parameters, never retaining the handle", async () => {
  const controller = new AutomationStudioFlowCandidateSubmissionController({ ...submission, binding: {
    resolvePlanNodeParameters: async ({ parameters }) => ({ status: "resolved", parameters: { ...parameters, text: "reusable locator description" } })
  } });
  const candidate = result();
  const nodes = ((candidate.plan as JsonObject).subflows as JsonObject[])[0]!.nodes as JsonObject[];
  nodes[0]!.parameters = { text: { handle: "issued.target" } };
  const accepted = await controller.submit(candidate);
  expect(accepted.ok).toBe(true);
  if (accepted.ok) {
    expect(JSON.stringify(accepted.candidate)).not.toContain("issued.target");
    expect(accepted.candidate.buildPlan.plan.subflows[0]?.nodes[0]?.parameters?.text).toBe("reusable locator description");
  }
});

it("rejects out-of-scope nodes, malformed bindings and missing permissions", async () => {
  const outside = new AutomationStudioFlowCandidateSubmissionController({ ...submission, resolution: { ...resolution, scope: { kind: "domain", domainId: "other" } } });
  expect((await outside.submit(result())).ok).toBe(false);
  const bound = result();
  const nodes = ((bound.plan as JsonObject).subflows as JsonObject[])[0]!.nodes as JsonObject[];
  nodes[0]!.parameters = { text: { $state: { path: "" } } };
  expect((await new AutomationStudioFlowCandidateSubmissionController(submission).submit(bound)).ok).toBe(false);
  const denied = new AutomationStudioFlowCandidateSubmissionController({ ...submission, binding: {
    resolvePlanNodeParameters: async () => ({ status: "needs_permission", missing: ["send_or_publish"], requestId: "request.permission" })
  } });
  const receipt = await denied.submit(result());
  expect(receipt.ok).toBe(false);
  if (!receipt.ok) expect(receipt.check.issueCodes.join(" ")).toContain("bootstrap.step_permission_required");
});

it("protects canonical candidate snapshots and receipt base identity", async () => {
  const controller = new AutomationStudioFlowCandidateSubmissionController(submission);
  const first = await controller.submit(result());
  expect(first.ok).toBe(true);
  if (!first.ok) return;
  first.candidate.buildPlan.plan.subflows[0]!.nodes[0]!.parameters = { text: "tampered" };
  expect(controller.latest()?.buildPlan.plan.subflows[0]?.nodes[0]?.parameters?.text).toBe("reusable criterion");
  expect(controller.matches({ ...first.candidate, baseDependencyDigest: "changed.accepted.base" })).toBe(false);
});
