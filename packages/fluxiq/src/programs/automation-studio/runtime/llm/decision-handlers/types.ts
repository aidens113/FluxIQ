// What every decision handler is handed, and what it hands back.
//
// The loop (`../evidence-loop.ts`) owns its state; a handler reads and writes
// that state through this one object rather than through a closure over the
// loop's locals, so each kind of answer can live in a file of its own and the
// next thing every handler needs is one more member here and one more line
// where the loop builds it.
import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDraftAmendmentRefusal, AutomationStudioFlowDraftStep, AutomationStudioFlowDraftUnreachedStep } from "../../flow-draft/index.ts";
import type { AutomationStudioLlmEvidenceEntry } from "../context-window.ts";
import type { AutomationStudioLlmDecisionContextRecorder } from "../decision-context/index.ts";
import type {
  AutomationStudioLlmEvidenceAmendmentMemory,
  AutomationStudioLlmEvidenceAuthoredProgress,
  AutomationStudioLlmEvidenceHeldAmendments,
  AutomationStudioLlmEvidenceLoopAccounting,
  AutomationStudioLlmEvidenceLoopAnswerability,
  AutomationStudioLlmEvidenceLoopDecision,
  AutomationStudioLlmEvidenceLoopDraftChange,
  AutomationStudioLlmEvidenceLoopProgress,
  AutomationStudioLlmEvidenceLoopResult,
  AutomationStudioLlmEvidenceLoopTrace,
  AutomationStudioLlmEvidenceNoProgress,
  AutomationStudioLlmEvidenceTool
} from "../evidence-loop/index.ts";
import type { AutomationStudioLlmEvidenceRepeatGuard } from "../repeat-guard/index.ts";
import type { AutomationStudioLlmEvidenceLoopInput, EvidenceLoopLimits } from "../loop-configuration.ts";
import type { AutomationStudioFlowDraftDryRunRefusal } from "../node-tools/index.ts";
import type { AutomationStudioLlmEvidenceLookWithdrawal } from "./look-withdrawal.ts";

/** What a recorded row changed, beside the row itself: the loop turns it into the row's `progress`. */
export type AutomationStudioLlmEvidenceRowTransition = {
  draftChanged?: boolean;
  pageState?: AutomationStudioLlmEvidenceLoopProgress["pageState"];
  answerability?: AutomationStudioLlmEvidenceLoopAnswerability;
  draftChange?: AutomationStudioLlmEvidenceLoopDraftChange;
};

/** The loop's counters: numbers the loop and its handlers both read and move. */
export type AutomationStudioLlmEvidenceLoopCounters = {
  /** Amendments carried out, held to `limits.maxDraftAmendments`. */
  draftAmendments: number;
  /** The far backstop: unusable decisions in a row, however they differ. */
  unusableInARow: number;
  /**
   * Times the model asked to finish, refused or not. A loop that ran out of
   * turns having never tried to finish and one that tried three times and was
   * refused are different builds, and the ending alone cannot tell them apart.
   */
  completionAttempts: number;
  /** Calls that failed: counted as calls, never as evidence toward `minToolCalls`. */
  failedToolCalls: number;
  /**
   * What has changed, and what has happened: two counters, and
   * `../repeat-policy.ts` says which question each of them answers.
   */
  mutationEpoch: number;
  attemptEpoch: number;
};

/** The loop state a decision handler reads and writes. */
export type AutomationStudioLlmEvidenceDecisionHandlerContext = {
  input: AutomationStudioLlmEvidenceLoopInput;
  limits: EvidenceLoopLimits;
  trace: AutomationStudioLlmEvidenceLoopTrace[];
  accounting: AutomationStudioLlmEvidenceLoopAccounting;
  /** The draft, kept whether or not it is shown. */
  draftSteps: AutomationStudioFlowDraftStep[];
  amendmentMemory: AutomationStudioLlmEvidenceAmendmentMemory;
  noProgress: AutomationStudioLlmEvidenceNoProgress;
  /** Everything gathered; each decision is shown all of it. */
  evidence: AutomationStudioLlmEvidenceEntry[];
  /**
   * Every decision and what the loop answered it (`../decision-context/`):
   * each place the loop answers the model records one row here, and the next
   * decision is shown them beside the window.
   */
  history: AutomationStudioLlmDecisionContextRecorder;
  /** The draft's revision now: what a completion is checked against. */
  draftRevision(): number;
  /** The newest call that ran an action, and the iteration it ran at; written by whoever runs one. */
  lastAction: { callId: string; iteration: number } | undefined;
  /**
   * What the dry run did during the current completion attempt: whether it
   * replayed at all, whether it reused an earlier clean replay instead, and the
   * verdict it showed when it refused. The handler
   * clears it before the attempt; the loop's gate callbacks fill it.
   */
  dryRunSeen: { ran: boolean; reused?: boolean; verdict?: JsonValue };
  /**
   * Requests already asked again once, and run then to see whether the page
   * was as the answering call left it (`./answer-check.ts`). Keyed on the
   * request's signature, which carries its epoch, so each is run again at most
   * once per epoch and every later ask is answered from memory.
   */
  reaskedRequests: Set<string>;
  /**
   * The state each call left, by call id, where the call reported one or the
   * caller's digest hook gave one: what a look asked again is compared with.
   */
  callStates: Map<string, string>;
  /** What each call did on the page it found, so a call that failed or changed nothing is not made again there (`../repeat-guard/`). */
  repeats: AutomationStudioLlmEvidenceRepeatGuard;
  /** Looks withdrawn after an ignored redirect (`./look-withdrawal.ts`). */
  looks: AutomationStudioLlmEvidenceLookWithdrawal;
  toolIds: ReadonlySet<string>;
  toolsById: ReadonlyMap<string, AutomationStudioLlmEvidenceTool>;
  /** Whether a failed call is shown to the model rather than ending the loop. */
  observeToolFailures: boolean;
  counters: AutomationStudioLlmEvidenceLoopCounters;
  /** Pushes one row of the record, stamped with its moment and progress. */
  recordRow(row: AutomationStudioLlmEvidenceLoopTrace, transition?: AutomationStudioLlmEvidenceRowTransition): void;
  /** Appends a step to the draft; answers whether the shown draft changed. */
  draftRecord(step: Omit<AutomationStudioFlowDraftStep, "position" | "disposition" | "id">): boolean;
  /** Counts evidence the loop itself adds in the accounting, and returns its bytes. A count, never a limit. */
  accountEvidence(value: JsonValue): number;
  /** One more unusable decision: the error that ends the loop once a guard is reached, or nothing. */
  unusable(step: AutomationStudioLlmEvidenceLoopTrace, issueCodes: readonly string[], transition?: AutomationStudioLlmEvidenceRowTransition): { error: unknown } | undefined;
  /** The draft's dry-run gate (`../node-tools/dry-run-gate.ts`). */
  dryRun(): Promise<AutomationStudioFlowDraftDryRunRefusal | undefined>;
  /** Whether the draft the model authors has advanced; absent under the transcript rule (`../evidence-progress/authored-progress.ts`). */
  authored: AutomationStudioLlmEvidenceAuthoredProgress | undefined;
};

/**
 * The amendments a decision made about the step it reruns, waiting for the
 * rerun (`../evidence-loop/held-amendments.ts`), and what the rest of the
 * decision already came to, so the model is told the whole decision at once.
 */
export type AutomationStudioLlmEvidenceRerunHeld = {
  /** Screened authored merge provenance, never current or previous resolved arguments. */
  retained?: import("../rerun-arguments/index.ts").AutomationStudioRerunArgumentMetadata;
  amendments: AutomationStudioLlmEvidenceHeldAmendments;
  /** The node the rerun's step ran: what a held refusal is recorded against. */
  nodeId: string;
  /** How many of the decision's other amendments landed. */
  applied: number;
  /** Their refusals, as already given (`../evidence-loop/amendment-memory.ts`). */
  refusals: ReadonlyArray<AutomationStudioFlowDraftAmendmentRefusal & { nodeId?: string; repeated?: true }>;
  /** Acts the decision's other amendments moved off a step left in the Flow, told with the refusals (`./amendment.ts`). */
  moved?: ReadonlyArray<{ act: string; from: number; to: number }>;
  /**
   * Steps of the Flow the decision's other amendments newly left after a step
   * that does not bring them to their page, told with the refusals and never
   * counted as one (`../../flow-draft/amendment/strand-check.ts`).
   */
  unreached?: ReadonlyArray<AutomationStudioFlowDraftUnreachedStep>;
  /**
   * What the decision is measured against once its rerun has run (`./amendment.ts`):
   * its signature (`../decision-context/signature.ts`), the draft's key before it
   * (`../repeat-guard/draft-key.ts`), and what the replaced step observed.
   */
  before: { signature: string; draft: string; observed: string };
};

/**
 * What a decision that ran a rerun came to once it settled: the fields its
 * rerun's row records of the held amendments, and whether the decision changed
 * nothing -- its rerun took its step's place and left the Flow and what the
 * step observed as they were (`./amendment.ts`).
 */
export type AutomationStudioLlmEvidenceRerunSettled = {
  row: Pick<AutomationStudioLlmEvidenceLoopTrace, "amended" | "amendmentsRefused">;
  unchanged: boolean;
};

/** What the loop does once a handler has answered: ask again, end, or run a rerun as this iteration's call. */
export type AutomationStudioLlmEvidenceDecisionNext =
  | { kind: "continue" }
  | { kind: "end"; result: AutomationStudioLlmEvidenceLoopResult }
  | {
    kind: "rerun";
    decision: Extract<AutomationStudioLlmEvidenceLoopDecision, { kind: "tool_call" }>;
    /** The step the call replaces, withdrawn only once the call has worked. */
    replaces: AutomationStudioFlowDraftStep | undefined;
    /** The decision's amendments naming that step, settled once the call has run (`./amendment.ts`). */
    held?: AutomationStudioLlmEvidenceRerunHeld;
  };
