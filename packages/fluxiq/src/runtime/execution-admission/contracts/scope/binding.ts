export interface ExecutionScopeBinding {
  readonly projectId: string;
  readonly ownerKey: string;
  readonly continuationKey: string;
  readonly resourceKeys: readonly string[];
  readonly coverageEpoch: string;
}
