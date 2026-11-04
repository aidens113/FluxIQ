// What one attempt holds from its opening to its ending, across every round: the records that
// must survive a fresh start (the act record, the rows, what was tried, the draft) and the
// counts its row reports. A round is thrown away; this is not.

import type { AutomationStudioTaskAttemptLoopsCaught, AutomationStudioTaskAttemptPath } from "@fluxiq/contracts/automation";
import type { AutomationStudioAttemptActRecord } from "../../../../../runtime/answer-first/act-record/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../../../runtime/flow-authoring/draft/index.ts";
import type { AutomationStudioFlowBootstrapActionPermissions } from "../../../../../runtime/flow-authoring/bootstrap/index.ts";
import type { AutomationStudioHarnessOptionLoopBinding } from "../../../../../runtime/llm/index.ts";
import type { AutomationStudioAnswerFirstAttemptStore } from "../attempt-store/index.ts";
import type { AutomationStudioAnswerFirstCompletionCheck } from "../completion/index.ts";
import type { AutomationStudioAnswerFirstFlowRunOutcome } from "../flow-run/index.ts";
import type { AutomationStudioAnswerFirstRoute } from "../route/index.ts";
import type { AutomationStudioAnswerFirstRowSink, AutomationStudioAnswerFirstSession } from "../rows/index.ts";
import type { AutomationStudioAnswerFirstAttemptProvenance, AutomationStudioAnswerFirstTaskMemoryStore } from "../task-memory/index.ts";
import type { AutomationStudioAnswerFirstWitnesses } from "../witnesses/index.ts";
import type { AutomationStudioAnswerFirstAttemptInput } from "./contracts.ts";
import type { AutomationStudioLlmLoopAttemptRecord } from "../../../../../runtime/llm/repeat-guard/index.ts";
import type { AutomationStudioAnswerFirstAskedRepeats } from "../../../../../runtime/answer-first/asked-count/index.ts";
import type { AutomationStudioAnswerFirstAttemptPorts } from "./ports.ts";

export type AutomationStudioAnswerFirstAttemptRun = {
  input: AutomationStudioAnswerFirstAttemptInput;
  ports: AutomationStudioAnswerFirstAttemptPorts;
  store: AutomationStudioAnswerFirstAttemptStore;
  /** What the task keeps across its attempts, wherever they lived. */
  memory: AutomationStudioAnswerFirstTaskMemoryStore;
  taskId: string;
  /** Where this attempt started from, and the notes it brought. */
  route: AutomationStudioAnswerFirstRoute;
  startedFrom?: AutomationStudioAnswerFirstAttemptProvenance["startedFrom"];
  /** The steps it started its draft from. */
  startedWith: readonly AutomationStudioFlowDraftStep[];
  /** How it is going at the task, as its row says. Settled at the ending (`./path.ts`). */
  path: AutomationStudioTaskAttemptPath;
  /** The saved Flow's run, where one was tried: what came of it, whether anything really went out, and what the judge said of a whole run. */
  flowRun?: { outcome: AutomationStudioAnswerFirstFlowRunOutcome; wentOut: boolean; judged?: "yes" | "no" | "unsure" } | undefined;
  /** The highest step position a forward run passed. */
  forwardReached: number;
  attemptId: string;
  ordinal: number;
  runId: string;
  startedAtMs: number;
  record: AutomationStudioAttemptActRecord;
  /** One per attempt, handed to every round (t859): what was tried and how, across fresh rounds. */
  tried: AutomationStudioLlmLoopAttemptRecord;
  /** How many landings of one act the person's request asks for (`../../../../../runtime/answer-first/asked-count/`). */
  asked: AutomationStudioAnswerFirstAskedRepeats;
  /** The act of the request the latest decision says its call does, for `asked`: which act, never how many. */
  claim?: string | undefined;
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
  /** The refusal the rounds ended on where no model call was ever made: thrown on, to become a setup step (`../setup/`). */
  setupRefusal?: unknown;
  /** What the attempt waits for right now, for its stored row. */
  waitingFor?: "permission" | "person_only_check" | "stuck_in_a_loop" | undefined;
};
