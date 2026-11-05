// What applying a proven Flow reads of an attempt, and nothing else of it, so the attempt's own
// state stays the attempt's (`../attempt/state.ts`, which answers this as it stands).

import type { AutomationStudioTaskAttemptPath } from "@fluxiq/contracts/automation";
import type { AutomationStudioFlowBootstrapActionPermissions } from "../../../../../runtime/flow-authoring/bootstrap/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../../../runtime/flow-authoring/draft/index.ts";
import type { AutomationStudioAnswerFirstAttemptInput } from "../attempt/index.ts";
import type { AutomationStudioAnswerFirstFlowRunOutcome } from "../flow-run/index.ts";
import type { AutomationStudioAnswerFirstRoute } from "../route/index.ts";
import type { AutomationStudioAnswerFirstTaskMemoryStore } from "../task-memory/index.ts";

export type AutomationStudioAnswerFirstProvenAttempt = {
  input: Pick<AutomationStudioAnswerFirstAttemptInput, "owner" | "projectId" | "flowId" | "baseDependencyDigest" | "instructionIds" | "cancellation">;
  memory: Pick<AutomationStudioAnswerFirstTaskMemoryStore, "get" | "update">;
  taskId: string;
  attemptId: string;
  route: AutomationStudioAnswerFirstRoute;
  path: AutomationStudioTaskAttemptPath;
  flowRun?: { outcome: AutomationStudioAnswerFirstFlowRunOutcome; wentOut: boolean; judged?: "yes" | "no" | "unsure" } | undefined;
  decidedAfterRun: boolean;
  /** A carry-on's: what the attempt had when the person pressed. */
  prior?: object | undefined;
  steps: readonly AutomationStudioFlowDraftStep[];
  permissions: Pick<AutomationStudioFlowBootstrapActionPermissions, "instructed" | "declarations">;
};
