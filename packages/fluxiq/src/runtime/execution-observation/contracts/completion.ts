export interface ExecutionCallbackCompletion {
  readonly disposition: "unacted" | "settled";
  readonly completionDigest: string;
  readonly assessmentDigest: string;
}
