export interface ExecutionOriginRecord {
  readonly sourceKey: string;
  readonly operationKey: string;
  readonly runId?: string;
  readonly invocationId?: string;
  readonly attemptId?: string;
  readonly bindingDigest?: string;
}
