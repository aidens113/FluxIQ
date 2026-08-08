import { describe, expect, it } from "vitest";
import {
  createBlankAutomationStudioFlowArtifact,
  createPublishedFlowSnapshot,
  validateAutomationStudioFlow,
  type AutomationStudioFlowArtifact
} from "./index.ts";

describe("canonical Automation Studio Flow contract", () => {
  it("creates a private, visual-owned global Flow without legacy ownership", () => {
    const flow = createBlankAutomationStudioFlowArtifact({
      flowId: "flow.orders.handle",
      projectId: "project.orders",
      name: "Handle order",
      now: 1_000
    });

    expect(flow).toMatchObject({
      schemaVersion: "0.1",
      scope: { kind: "global" },
      visibility: "private",
      origin: "manual",
      source: { mode: "visual" },
      publication: { status: "draft" },
      createdAt: 1_000,
      updatedAt: 1_000
    });
    expect(validateAutomationStudioFlow(flow)).toEqual({ ok: true, issues: [] });
  });

  it("accepts a versioned public domain Flow with typed interface defaults", () => {
    const flow: AutomationStudioFlowArtifact = {
      ...createBlankAutomationStudioFlowArtifact({
        flowId: "flow.orders.fulfill",
        projectId: "project.orders",
        name: "Fulfill order",
        scope: { kind: "domain", domainId: "orders" },
        source: { mode: "code", moduleId: "flows/fulfill-order.ts", sourceDigest: "sha256:source", compiledDigest: "sha256:plan", compilerVersion: "0.1" },
        now: 1_000
      }),
      visibility: "public",
      interface: {
        inputs: [{ id: "order-id", name: "orderId", valueType: { kind: "string" }, defaultValue: "demo" }],
        outputs: [{ id: "fulfilled", name: "fulfilled", valueType: { kind: "boolean" } }]
      },
      variables: [{ id: "retries", name: "retries", valueType: { kind: "number" }, initialValue: 3 }],
      nodes: [{ id: "start", definitionId: "builtin.start" }, { id: "finish", definitionId: "builtin.finish" }],
      edges: [{ id: "start-finish", sourceNodeId: "start", targetNodeId: "finish", sourcePortId: "next", targetPortId: "in" }],
      publication: { status: "draft" }
    };
    const snapshot = createPublishedFlowSnapshot(flow, "1.0.0", 1_000);
    flow.publication = { status: "published", version: "1.0.0", publishedAt: 1_000, flowDigest: snapshot.flowDigest, interface: structuredClone(flow.interface), snapshot };
    flow.publicationHistory = [snapshot];

    expect(validateAutomationStudioFlow(flow)).toEqual({ ok: true, issues: [] });
  });

  it("reports structural, type, source, scope, and publication errors", () => {
    const invalid: AutomationStudioFlowArtifact = {
      ...createBlankAutomationStudioFlowArtifact({ flowId: "", projectId: "", name: "", now: 1_000 }),
      scope: { kind: "domain", domainId: "" },
      source: { mode: "code", moduleId: "" },
      visibility: "public",
      interface: {
        inputs: [
          { id: "input", name: "same", valueType: { kind: "number" }, defaultValue: "wrong" },
          { id: "input", name: "same", valueType: { kind: "schema", schemaId: "" } }
        ],
        outputs: []
      },
      variables: [
        { id: "variable", name: "same", valueType: { kind: "boolean" }, initialValue: "wrong" },
        { id: "variable", name: "same", valueType: { kind: "boolean" } }
      ],
      errors: [{ id: "failure" }, { id: "failure" }],
      nodes: [{ id: "node", definitionId: "" }, { id: "node", definitionId: "builtin.test" }],
      edges: [{ id: "edge", sourceNodeId: "node", targetNodeId: "missing", sourcePortId: "out" }],
      executionDefaults: { timeoutMs: 0, maxConcurrency: 1.5 },
      publication: { status: "draft" },
      updatedAt: 999
    };

    expect(validateAutomationStudioFlow(invalid).issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "flow.missing_id",
      "flow.missing_project_id",
      "flow.missing_name",
      "flow.updated_before_created",
      "flow.missing_domain_id",
      "flow.missing_code_module",
      "flow.duplicate_port_id",
      "flow.port_default_type_mismatch",
      "flow.schema_type_missing_id",
      "flow.variable_initial_type_mismatch",
      "flow.duplicate_variable_id",
      "flow.duplicate_error_id",
      "flow.node_missing_definition",
      "flow.duplicate_node_id",
      "flow.edge_missing_target_node",
      "flow.edge_incomplete_port_binding",
      "flow.invalid_timeout",
      "flow.invalid_max_concurrency",
      "flow.public_requires_published_version"
    ]));
  });
});
