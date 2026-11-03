export type InstructionScope =
  | { kind: "global" }
  | { kind: "project"; projectId: string }
  | { kind: "flow"; projectId: string; flowId: string }
  | { kind: "router"; projectId: string; flowId: string; routerId: string }
  | { kind: "subflow"; projectId: string; flowId: string; subflowId: string }
  | { kind: "node"; projectId: string; flowId: string; nodeId: string; subflowId?: string }
  | { kind: "on_error"; projectId: string; flowId: string; subflowId?: string; nodeId?: string }
  | { kind: "adaptation_review"; projectId: string; flowId: string; subflowId?: string };
