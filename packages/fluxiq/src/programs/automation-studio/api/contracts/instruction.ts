import type { FlowIdProjectRequest, FlowProjectRequest } from "./flow.ts";

export type FlowInstructionRequest = FlowProjectRequest & {
  instructionId: string;
};

export type FlowInstructionSetRequest = FlowProjectRequest & {
  flowId?: string;
  subflowId?: string;
};

export type SaveFlowInstructionRequest = FlowIdProjectRequest & {
  instructionId?: string;
  title: string;
  body: string;
  scopeKind?: "global" | "project" | "flow" | "router" | "subflow" | "node" | "on_error" | "adaptation_review";
  routerId?: string;
  subflowId?: string;
  nodeId?: string;
  priority?: unknown;
  status?: string;
  requirement?: string;
  tags?: string[];
};

export type FlowChangeProposalRequest = FlowIdProjectRequest & {
  proposalId: string;
};

export type SaveFlowGenerationInstructionRequest = FlowIdProjectRequest & {
  authSessionId: string;
  instruction: string;
};
