// What one attempt holds from its opening to its ending, across every round: the records that
// must survive a fresh start (the act record, the rows, what was tried, the draft) and the
// counts its row reports. A round is thrown away; this is not.

import type { AutomationStudioTaskAttemptLoopsCaught } from "@fluxiq/contracts/automation";
import type { AutomationStudioAttemptActRecord } from "../../../../../runtime/answer-first/act-record/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../../../runtime/flow-authoring/draft/index.ts";
import type { AutomationStudioFlowBootstrapActionPermissions } from "../../../../../runtime/flow-authoring/bootstrap/index.ts";
import type { AutomationStudioHarnessOptionLoopBinding } from "../../../../../runtime/llm/index.ts";
import type { AutomationStudioAnswerFirstAttemptStore } from "../attempt-store/index.ts";
import type { AutomationStudioAnswerFirstCompletionCheck } from "../completion/index.ts";
import type { AutomationStudioAnswerFirstRowSink, AutomationStudioAnswerFirstSession } from "../rows/index.ts";
import type { AutomationStudioAnswerFirstWitnesses } from "../witnesses/index.ts";
import type { AutomationStudioAnswerFirstAttemptInput } from "./contracts.ts";
import type { AutomationStudioAnswerFirstAttemptPorts } from "./ports.ts";
import type { AutomationStudioAnswerFirstTriedLog } from "./tried-log.ts";

export type AutomationStudioAnswerFirstAttemptRun = {
  input: AutomationStudioAnswerFirstAttemptInput;
  ports: AutomationStudioAnswerFirstAttemptPorts;
  store: AutomationStudioAnswerFirstAttemptStore;
  taskId: string;
  attemptId: string;
  ordinal: number;
  runId: string;
  startedAtMs: number;
  record: AutomationStudioAttemptActRecord;
  tried: AutomationStudioAnswerFirstTriedLog;
  sink: AutomationStudioAnswerFirstRowSink;
  session: AutomationStudioAnswerFirstSession;
  witnesses: AutomationStudioAnswerFirstWitnesses;
  completion: AutomationStudioAnswerFirstCompletionCheck;
  permissions: AutomationStudioFlowBootstrapActionPermissions;
  /** The domain's tools the chain sends to now: the arrival's until the page has got there, then the ones with no start location. */
  options: AutomationStudioHarnessOptionLoopBinding;
  /** The draft as the latest decision was shown it: what a fresh round is seeded with, and what the ending saves. */
  steps: AutomationStudioFlowDraftStep[];
  usage: { estimatedInputTokens: number; inputTokens: number; outputTokens: number; totalTokens: number };
  liveSteps: number;
  /** A call came back answered, so the page has got to where the Flow starts. */
  arrived: boolean;
  loopsCaught: AutomationStudioTaskAttemptLoopsCaught;
  /** Silences of the model service in a row (`../../../../../runtime/answer-first/keep-going/backoff.ts`). */
  backoffs: number;
  /** Time spent waiting on a person or a silent service, which a round's own clock leaves out. */
  waitedMs: number;
  /** Loop detection's last rung fired: the next thing the attempt does is ask. */
  askPerson: boolean;
  /** Set by a round whose person-only check ended it. */
  personEnded?: "stopped" | "timed_out" | "unreachable" | "cancelled" | "asks_exhausted" | undefined;
  /** What the attempt waits for right now, for its stored row. */
  waitingFor?: "permission" | "person_only_check" | "stuck_in_a_loop" | undefined;
};
