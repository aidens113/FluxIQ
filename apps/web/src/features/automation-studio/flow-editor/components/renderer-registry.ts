import { AUTOMATION_HANDLER_NODE_TYPE } from "../node-types";
import { FlowEdge } from "./FlowEdge";
import { FlowHandlerNode } from "./FlowHandlerNode";
import { FlowNode } from "./FlowNode";

export const automationNodeTypes = {
  policyNode: FlowNode,
  [AUTOMATION_HANDLER_NODE_TYPE]: FlowHandlerNode
};

export const automationEdgeTypes = {
  automationEdge: FlowEdge
};
