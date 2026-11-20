/** Frame location only; projected frame inputs never authenticate an execution capture. */
export type AutomationStudioInputUseLocation = Readonly<{
  invocationId: string;
  graphFlowId: string;
  graphRevision: number | null;
  subflowId: string | null;
  parentInvocationId?: string;
  callNodeId?: string;
}>;
