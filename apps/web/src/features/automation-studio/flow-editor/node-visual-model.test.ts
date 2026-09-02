import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Node } from "@xyflow/react";
import { spawnAutomationNodePosition } from "../graph/interaction-geometry";
import {
  AUTOMATION_FLOW_NODE_HEIGHT,
  AUTOMATION_FLOW_NODE_WIDTH,
  automationFlowNodeDimensions,
  withAutomationFlowNodeDimensions,
  type AutomationFlowNodeData
} from "./node-types";

function data(definitionId: string, isStart = false): AutomationFlowNodeData {
  return {
    nodeDefinitionId: definitionId,
    label: definitionId,
    description: "",
    actionTypes: [],
    recovery: "ready",
    evidenceCount: 0,
    readinessCount: 0,
    successCount: 0,
    inputs: [],
    outputs: [],
    parameters: [],
    parameterValues: {},
    isStart
  };
}

describe("flow node visual geometry", () => {
  it("uses the same stable dimensions for every node kind", () => {
    for (const node of [
      data("builtin.control.start", true),
      data("builtin.control.end"),
      data("builtin.logic.compare")
    ]) expect(automationFlowNodeDimensions(node)).toEqual({
      width: AUTOMATION_FLOW_NODE_WIDTH,
      height: AUTOMATION_FLOW_NODE_HEIGHT
    });
  });

  it("writes standard dimensions before React Flow measures every node", () => {
    const node = withAutomationFlowNodeDimensions({
      id: "start",
      type: "policyNode",
      position: { x: 0, y: 0 },
      data: data("builtin.control.start", true)
    });
    expect(node.initialWidth).toBe(AUTOMATION_FLOW_NODE_WIDTH);
    expect(node.initialHeight).toBe(AUTOMATION_FLOW_NODE_HEIGHT);
    expect(node.measured).toEqual({ width: AUTOMATION_FLOW_NODE_WIDTH, height: AUTOMATION_FLOW_NODE_HEIGHT });
  });

  it("spawns at the visible camera center instead of after the selected node", () => {
    const selected: Node<Record<string, unknown>> = {
      id: "selected",
      position: { x: 20, y: 30 },
      measured: { width: 220, height: 156 },
      data: {}
    };
    const flow = { screenToFlowPosition: (point: { x: number; y: number }) => point };
    const frame = {
      getBoundingClientRect: () => ({
        left: 100, top: 50, right: 1_100, bottom: 850, width: 1_000, height: 800
      })
    } as HTMLElement;
    expect(spawnAutomationNodePosition("selected", [selected], [], flow as never, frame, { width: 220, height: 156 })).toEqual({
      x: 490,
      y: 392
    });
  });

  it("uses one card structure with compact status chips and unclipped ports", () => {
    const nodeSource = readFileSync(new URL("./FlowNode.tsx", import.meta.url), "utf8");
    const commandSource = readFileSync(new URL("./useFlowEditorCommands.ts", import.meta.url), "utf8");
    const styles = readFileSync(new URL("../styles/flow-editor/03-nodes-ports.css", import.meta.url), "utf8");

    expect(nodeSource).not.toContain("automation-terminal-node");
    expect(nodeSource).not.toContain("terminalKind");
    expect(styles).toContain("grid-template-rows: auto auto auto minmax(72px, 1fr) auto");
    expect(styles).toContain(".node-state-indicators {");
    expect(styles).toContain("height: auto");
    expect(styles).toContain("min-height: 22px");
    expect(styles).toContain("overflow: visible");
    expect(styles).toContain("width: 14px");
    expect(styles).toContain("height: 14px");
    expect(styles).toContain(".automation-react-flow-frame .react-flow__edges {");
    expect(styles).toContain(".automation-react-flow-frame .react-flow__edges > svg {");
    expect(commandSource).not.toContain("flowInstance?.fitView");
  });
});
