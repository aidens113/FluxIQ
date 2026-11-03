import type { OutputTargetPreparerBinding } from "../../output-dispatch/contracts/index.ts";
import type { RecordingEntryTargetPreparerBinding } from "../../recording/target-preparation/index.ts";
import type { RecordingTargetPolicyBinding } from "../../recording/target-policy/index.ts";

/** Per-runtime, domain-scoped original invocation identities. */
export interface NativeTargetPreparationReader {
  output(domainId: string): OutputTargetPreparerBinding | undefined;
  recording(domainId: string): RecordingEntryTargetPreparerBinding | undefined;
  policy(domainId: string): RecordingTargetPolicyBinding | undefined;
  requiresRecordingPolicy(domainId: string): boolean;
}
