import type { RecordingTargetPolicy } from "./policy.ts";

/** Original methods and receiver pinned by the native domain registration. */
export interface RecordingTargetPolicyBinding {
  readonly receiver: RecordingTargetPolicy;
  readonly accepts: RecordingTargetPolicy["accepts"];
  readonly commandTarget: RecordingTargetPolicy["commandTarget"];
  readonly targetIssues: RecordingTargetPolicy["targetIssues"];
  readonly parameterIssues: RecordingTargetPolicy["parameterIssues"];
}
