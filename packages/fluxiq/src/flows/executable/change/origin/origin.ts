export type ExecutableChangeOrigin =
  | { entryPoint: "instruction"; instructionIds: string[] }
  | { entryPoint: "run_failure"; runId: string; failedNodeId: string; failureSignature: string }
  | { entryPoint: "edge_case"; instructionIds: string[]; runId?: string; failureSignature?: string };
