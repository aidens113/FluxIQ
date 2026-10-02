// A run that executed cleanly and answered wrongly, as the failure entry point
// reads it.
//
// The recovery ladder is keyed on a *failed attempt*: Stage A classifies one,
// Stage B plans from that classification, and `plan.ts`'s `unclassifiedPlan`
// answers `stop` when there is none. A Flow whose every node succeeded and
// whose result does not answer the request has no failed attempt, so it reached
// the planner as "nothing to classify" and was stopped -- while Core's own
// result verification had already refuted it twice. Both runs of campaign
// `ten-sites-r5` ended that way: 38 provider calls, of which 34 were the build
// and 4 the verification, and **zero** were a repair
// (`fa-r5-postmortem.md`, cause 2).
//
// Nothing about the ladder is wrong; what was missing is the attempt. The
// verification already produces an `AutomationStudioFailureRecord` -- category
// `output_not_observed`, stage `verification`, with what was expected and what
// was observed -- and that record is exactly what the classifier reads. So this
// module does not add a second repair path. It builds the one attempt the
// existing path was waiting for, and hands it to the same Stage A the ladder
// already runs.
//
// **Which node it names.** The node the result came out of: the last attempt
// that stored records. That is the step whose rows the verification judged, so
// it is the step a repair edits or inserts steps ahead of, and the step the
// re-author's brief says the rows came out of (`history.ts`).
//
// **And when no step stored anything, none.** The refutation is then about the
// result -- no record set, a Flow with no step that keeps what it read -- and
// not about any step. It used to fall back to "the last attempt that
// succeeded", and that filed the refutation as a failure of whatever happened
// to run last: live run 38 (`run-muqilf9s-c3211328`) reported a navigate back
// to the feed that ran and matched as the Flow's failed step, the Lab listed a
// failed navigate, and the runtime patch was handed a step with nothing wrong
// (`no_repair`); bigbox `run-muqiojz4-04a7a8fc` did the same to an "Add to
// cart" press. Such an attempt now carries `AUTOMATION_STUDIO_REFUTED_RESULT_NODE_ID`,
// which no Flow node has, so every reader that joins it to a node joins it to
// nothing, and `automationStudioRefutedResultAttemptNamesNode` answers `false`
// for it: a repair of it is a re-author's, never a node patch's. A run with no
// succeeded attempt at all still produces no attempt: it either failed at a
// step, and the ladder already ran, or it recorded nothing to speak about.
//
// **What it does not claim.** No route, no inputs, no outputs, no transition
// comparison. The run's steps did what they said; it is the answer that is
// wrong, and an attempt that invented a step failure would put a claim in the
// record that nothing observed.

import { parseAutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowRunActionAttemptRecord, AutomationStudioFlowRunDetail } from "../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../executor.ts";
import type { AutomationStudioResultRepairDirective, AutomationStudioResultVerificationOutcome } from "../../result-verification/index.ts";

/** The attempt id prefix, so a reader can tell this attempt from one the graph executed. */
export const AUTOMATION_STUDIO_REFUTED_RESULT_ATTEMPT_PREFIX = "result-verification";

/**
 * The node id, and the definition id, of a refutation that names no step: the
 * result's own verification. A valid id, because the run's stores require one
 * on every attempt, and one no Flow node carries.
 */
export const AUTOMATION_STUDIO_REFUTED_RESULT_NODE_ID = AUTOMATION_STUDIO_REFUTED_RESULT_ATTEMPT_PREFIX;

/**
 * The failure entry point's two shapes of the same attempt: the live trace the
 * ladder classifies and patches from, and the run record the recovery context
 * and the request's recent actions are read out of.
 */
export type AutomationStudioRefutedResultAttempt = {
  trace: AutomationStudioNodeAttemptTrace;
  record: AutomationStudioFlowRunActionAttemptRecord;
};

export type AutomationStudioRefutedResultAttemptInput = {
  runId: string;
  /** The finished run, for the node its result came out of. */
  detail: AutomationStudioFlowRunDetail;
  /** The verification's own answer. Only a refutation produces an attempt. */
  outcome: AutomationStudioResultVerificationOutcome;
  now: number;
  /** Which repair of this run the attempt opens. The first keeps the id it always had; a later one is suffixed, so two refutations of one run never share an id. */
  attempt?: number | undefined;
};

/**
 * The failed attempt a refuted result amounts to, or `undefined` when there is
 * none to build.
 *
 * `undefined` for three reasons, and they are different facts: the verification
 * never happened, so nothing was judged; it happened and did not refute the
 * result; or it refuted the result and no step of the run succeeded, so the
 * run already failed at a step or recorded none. Each of them is a run this module has nothing to say about, and
 * none of them is "the result was right".
 *
 * `unsure` is deliberately not a refutation here. It is the verdict for a
 * result nobody could judge -- it still fails the run, and it still must never
 * read as a pass -- but a repair planned from it would be a change to a Flow on
 * evidence that nothing was wrong with it. Only `does_not_answer`, which is a
 * judgement that the answer is wrong, becomes an attempt.
 */
export function automationStudioRefutedResultAttempt(input: AutomationStudioRefutedResultAttemptInput): AutomationStudioRefutedResultAttempt | undefined {
  const outcome = input.outcome;
  if (outcome.performed !== true || outcome.verdict !== "does_not_answer") return undefined;
  // Parsed rather than trusted, as everywhere else a failure record is read:
  // the verdict reaches here through the same contract a domain's record does.
  const failure = parseAutomationStudioFailureRecord(outcome.failure);
  if (!failure || failure.stage !== "verification") return undefined;
  const succeeded = [...(input.detail.actionAttempts ?? [])].reverse().filter((attempt) => attempt.status === "succeeded");
  if (!succeeded.length) return undefined;
  const source = resultProducingAttempt(succeeded);
  const nodeId = source?.nodeId ?? AUTOMATION_STUDIO_REFUTED_RESULT_NODE_ID;
  const definitionId = source?.definitionId ?? AUTOMATION_STUDIO_REFUTED_RESULT_NODE_ID;
  // From where the result was finished: its producer's end, or the run's last step's.
  const ended = source ?? succeeded[0]!;
  const startedAt = ended.finishedAt ?? ended.startedAt;
  const order = (input.detail.actionAttempts ?? []).reduce((highest, attempt) => Math.max(highest, attempt.order), 0) + 1;
  const attemptId = `${AUTOMATION_STUDIO_REFUTED_RESULT_ATTEMPT_PREFIX}.${input.runId}${input.attempt !== undefined && input.attempt > 1 ? `.${input.attempt}` : ""}`;
  return {
    trace: {
      attemptId,
      nodeId,
      definitionId,
      startedAt,
      finishedAt: input.now,
      status: "failed",
      // The failure prose is capped at 1,024 characters and can spend that
      // entire bound on Core's fix lines before the judge's advice. Keep the
      // already-screened directive structured on the live synthetic attempt;
      // it reaches recovery context but is not copied into the persisted run.
      inputs: outcome.repair ? { resultRepair: resultRepairInput(outcome.repair) } : {},
      outputs: {},
      effects: [],
      message: outcome.reason,
      failure
    },
    record: {
      attemptId,
      nodeId,
      definitionId,
      order,
      status: "failed",
      startedAt,
      finishedAt: input.now,
      durationMs: Math.max(0, input.now - startedAt),
      message: outcome.reason,
      failure,
      // Verdict, basis and code: the same three words the run's own
      // `resultVerification` carries, so a reader of the attempt does not have
      // to go and find it. No observation and no reason text -- the record's
      // own `actual` already carries what was seen, under the contract's bound.
      metadata: { resultVerification: { verdict: outcome.verdict, basis: outcome.basis, code: outcome.code } }
    }
  };
}

function resultRepairInput(repair: AutomationStudioResultRepairDirective): JsonObject {
  return {
    schemaVersion: repair.schemaVersion,
    findings: repair.findings.map((finding) => ({
      code: finding.code,
      detail: finding.detail,
      ...(finding.datasetId ? { datasetId: finding.datasetId } : {}),
      ...(finding.columns?.length ? { columns: [...finding.columns] } : {})
    })),
    fix: [...repair.fix],
    ...(repair.judgement ? { judgement: { ...repair.judgement } } : {}),
    ...(repair.withheld ? { withheld: true } : {})
  };
}

/**
 * Whether a refuted result's attempt names a step of the Flow, or only the
 * result: `false` for the attempt of a run in which no step stored records.
 * A repair of an attempt that names no step is the re-author's alone, because
 * a node patch would be a change to a step nothing found wrong.
 */
export function automationStudioRefutedResultAttemptNamesNode(attempt: { nodeId: string }): boolean {
  return attempt.nodeId !== AUTOMATION_STUDIO_REFUTED_RESULT_NODE_ID;
}

/**
 * The node the result came out of: the last succeeded attempt that stored
 * records, because that is the step whose output the verification judged.
 * `undefined` when no attempt recorded a count -- the domain did not report
 * one, or the Flow has no step that stores what it read -- and the refutation
 * then names no step at all. The last step that succeeded used to stand in,
 * and it is exactly the step the refutation is not about.
 */
function resultProducingAttempt(newestFirst: readonly AutomationStudioFlowRunActionAttemptRecord[]): AutomationStudioFlowRunActionAttemptRecord | undefined {
  return newestFirst.find((attempt) => typeof attempt.metadata?.recordCount === "number");
}
