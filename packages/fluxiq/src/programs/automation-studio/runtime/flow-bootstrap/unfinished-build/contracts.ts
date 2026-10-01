// What a build that stopped before its Flow was ready is made of, as it moves
// through the user's lifecycle: how a live round ended, what the test and the
// judgement found, and how the build ended when it could not finish.
import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import type {
  AutomationStudioLlmEvidenceLoopAccounting,
  AutomationStudioLlmEvidenceLoopExhaustion,
  AutomationStudioLlmEvidenceLoopProviderUnavailable,
  AutomationStudioLlmEvidenceLoopResult,
  AutomationStudioLlmEvidenceLoopTrace,
  AutomationStudioLlmEvidenceLoopUnreadable
} from "../../llm/index.ts";
import type { AutomationStudioFlowBootstrapBudgetBound } from "../generation-failure/index.ts";

/** Why a live round stopped without the model saying the Flow was ready, where no budget was the reason. */
export type AutomationStudioFlowBootstrapUnfinishedStop =
  /** It used the decisions or tool calls a round is allowed. */
  | "iterations"
  | "tool_calls"
  /** Its decisions kept coming back unusable: most often completions the check kept refusing. */
  | "unusable_decisions"
  /** Its no-progress guard stopped it. */
  | "repeat_without_progress";

/** What a stopped round had recorded: its rows and what it spent. */
export type AutomationStudioFlowBootstrapRoundProgress = {
  trace: readonly AutomationStudioLlmEvidenceLoopTrace[];
  accounting: Readonly<AutomationStudioLlmEvidenceLoopAccounting>;
  /** Which allowance ran out, where the round ran out of one. */
  exhaustion?: AutomationStudioLlmEvidenceLoopExhaustion;
};

/** How one live round ended, read for what the build does next. */
export type AutomationStudioFlowBootstrapRoundEnding =
  /** The model said the Flow was ready, and the check and the test accepted it. */
  | { kind: "finished"; loop: Extract<AutomationStudioLlmEvidenceLoopResult, { ok: true }> }
  /** An ending this lifecycle does not reach past: cancelled, a refused configuration, the evidence backstop. */
  | { kind: "other"; loop: Extract<AutomationStudioLlmEvidenceLoopResult, { ok: false }> }
  /** It stopped short, with a draft to test, judge and repair. */
  | {
    kind: "unfinished";
    stopped: AutomationStudioFlowBootstrapUnfinishedStop;
    steps: AutomationStudioFlowDraftStep[];
    lastIssueCodes: readonly string[];
    completionAttempts: number;
    progress: AutomationStudioFlowBootstrapRoundProgress;
  }
  /**
   * The provider's replies kept arriving unreadable, each asked again with a
   * note of what could not be read, until an unbroken run of them reached its
   * limit (`../../llm/unreadable-reply.ts`): ended as exactly that, with how
   * many tries it took. `stopped` is the stop a later build is told.
   */
  | {
    kind: "unreadable";
    stopped: "unusable_decisions";
    unreadable: AutomationStudioLlmEvidenceLoopUnreadable;
    steps: AutomationStudioFlowDraftStep[];
    lastIssueCodes: readonly string[];
    completionAttempts: number;
    progress: AutomationStudioFlowBootstrapRoundProgress;
  }
  /**
   * The model provider stopped answering: an unbroken run of decision calls got
   * no answer (`../../llm/unanswered-calls.ts`). Ended at once, untested,
   * as exactly that. `stopped` is the stop a later build is told: no usable
   * decision came back.
   */
  | {
    kind: "provider_unavailable";
    stopped: "unusable_decisions";
    providerUnavailable: AutomationStudioLlmEvidenceLoopProviderUnavailable;
    steps: AutomationStudioFlowDraftStep[];
    lastIssueCodes: readonly string[];
    completionAttempts: number;
    progress: AutomationStudioFlowBootstrapRoundProgress;
  }
  /** A budget ran out: reported as exactly that. */
  | {
    kind: "budget";
    bound: AutomationStudioFlowBootstrapBudgetBound;
    steps: AutomationStudioFlowDraftStep[];
    lastIssueCodes: readonly string[];
    completionAttempts: number;
    progress: AutomationStudioFlowBootstrapRoundProgress;
  };

/** What the test of the Flow so far found. */
export type AutomationStudioFlowBootstrapTested = "replayed_clean" | "replay_failed" | "not_tested";

/**
 * The judgement of a Flow a round left unfinished (phase 2): what the test
 * did, and how much of what was asked the Flow does. Codes, counts and ids:
 * what the repair is told, and what an ending is written from.
 */
export type AutomationStudioFlowBootstrapJudgement = {
  /** The round that stopped: 0 for the exploration, then each repair. */
  round: number;
  stopped: AutomationStudioFlowBootstrapUnfinishedStop | "budget";
  tested: AutomationStudioFlowBootstrapTested;
  /** The test's refusal codes, when it refused. */
  testIssueCodes: string[];
  /** The positions, in the Flow, of the steps that did not work when it was run from its start. */
  failedSteps: number[];
  /** Steps in the Flow. */
  stepsInFlow: number;
  /** Acts and choices done, and the ids of those still to do. */
  done: number;
  todo: string[];
  /** The last refusal codes the model was shown before the round stopped. */
  lastIssueCodes: string[];
};
