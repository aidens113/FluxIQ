// The unit an in-run repair is held to, and its contract, as the model is
// shown it (state-aware recovery plan, C6 step 8): a handler's registration
// and body, and a part's interface, success check and checkpoints.

import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument } from "../../../../model/index.ts";
import { automationStudioRepairUnitContract } from "../index.ts";

function graph(): AutomationStudioFlowDocument {
  return {
    schemaVersion: "0.1",
    flowId: "flow.contract",
    ownerKind: "policy",
    ownerId: "flow.contract",
    name: "Contract",
    createdAt: 1,
    updatedAt: 1,
    metadata: { "fluxiq.successCheck": [{ fact: "list.loaded", op: "visible" }] },
    nodes: [
      { id: "read", definitionId: "builtin.data.constant", parameterValues: { value: "read", password: "hunter2" }, metadata: { "fluxiq.checkpoint": { id: "cp.read", requires: [] } } },
      { id: "handler.notice", definitionId: "builtin.control.handler", parameterValues: { event: "retry", scope: { kind: "nodes", nodeIds: ["read"] }, when: [{ fact: "dialog.visible", op: "visible" }], completionCheck: [{ fact: "dialog.visible", op: "absent" }], order: 0 } },
      { id: "handler.notice.step", definitionId: "builtin.data.constant", label: "Dismiss", parameterValues: { value: "dismiss" } },
      { id: "handler.notice.end", definitionId: "builtin.control.handler-end", parameterValues: { disposition: "resume" } }
    ],
    edges: [
      { id: "handler.body", sourceNodeId: "handler.notice", sourcePortId: "body", targetNodeId: "handler.notice.step", targetPortId: "in" },
      { id: "handler.done", sourceNodeId: "handler.notice.step", sourcePortId: "success", targetNodeId: "handler.notice.end", targetPortId: "in" }
    ]
  };
}

describe("the unit an in-run repair is held to", () => {
  it("shows a node's parameters through the repair context's screen", () => {
    const contract = automationStudioRepairUnitContract({ graph: graph(), unit: { kind: "node", nodeId: "read" }, deniedEvidenceKeys: [] });

    expect(contract).toMatchObject({ kind: "node", nodeId: "read", definitionId: "builtin.data.constant", parameters: { values: { value: "read", password: null }, withheld: ["password"] } });
  });

  it("shows a handler's registration and the body it runs", () => {
    const contract = automationStudioRepairUnitContract({ graph: graph(), unit: { kind: "handler", handlerNodeId: "handler.notice" } });

    expect(contract).toMatchObject({
      kind: "handler",
      handlerNodeId: "handler.notice",
      event: "retry",
      scope: { kind: "nodes", nodeIds: ["read"] },
      when: [{ fact: "dialog.visible", op: "visible" }],
      completionCheck: [{ fact: "dialog.visible", op: "absent" }],
      body: [{ nodeId: "handler.notice.step", label: "Dismiss" }, { nodeId: "handler.notice.end" }]
    });
  });

  it("shows a part's interface, success check and checkpoints, and says when the part could not be read", () => {
    const part = { ...graph(), interface: { inputs: [{ id: "query", name: "Query", valueType: "string", required: true }], outputs: [{ id: "rows", name: "Rows", valueType: "array" }] } };
    const contract = automationStudioRepairUnitContract({ graph: graph(), unit: { kind: "part", subflowId: "subflow.list" }, partGraph: part });

    expect(contract).toMatchObject({
      kind: "part",
      subflowId: "subflow.list",
      interface: { inputs: [{ id: "query", valueType: "string", required: true }], outputs: [{ id: "rows", valueType: "array" }] },
      successCheck: [{ fact: "list.loaded", op: "visible" }],
      checkpoints: [{ id: "cp.read", nodeId: "read" }]
    });
    expect(automationStudioRepairUnitContract({ graph: graph(), unit: { kind: "part", subflowId: "subflow.list" } })).toEqual({ kind: "part", subflowId: "subflow.list", absent: true });
  });
});
