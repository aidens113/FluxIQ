import type { JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../executor/contracts.ts";
import type { AutomationStudioHostStateSnapshotRef } from "../host-runtime.ts";

/** Private execution seam; never handed to native implementations, dispatchers or public options. */
export type AutomationStudioRuntimeRepeatSample = {
  before(node: AutomationStudioFlowNode, inputs: Readonly<Record<string, JsonValue>>, stateRef: AutomationStudioHostStateSnapshotRef | undefined, kind: "transparent" | "observed" | "barrier", attemptId: string): Promise<boolean>;
  after(attempt: AutomationStudioNodeAttemptTrace): Promise<void>;
  settle(): void;
  stop(): void;
  stopped(): boolean;
  abandon(): void;
};
