// What a finished run's verification does to the run's own record.
//
// A verdict nobody acts on is a comment. Four live runs on 2026-09-17 each
// reported `passed` while returning the wrong thing, and the only reason that
// was visible at all is that the test facility holds a written answer key. So
// this is the half that makes the verdict count: a run whose result does not
// answer the request, or whose result nobody could confirm, is written back as
// `failed`, with the code, the reason and the observation on the run, exactly
// as any other failure is.
//
// It runs only on a run that reported success. A run that already failed is
// already telling the truth, and spending a model call to add a second reason
// to it would buy nothing.
//
// A run whose result could not be put to a model at all keeps the status its
// steps earned and is recorded `unverified`, never `confirmed`
// (`verification-status.ts` says why it is not failed instead). So does a run
// whose record set holds no rows (`core.result.no_records`), which is never
// put to a model; and so does a run the model did not judge to answer and then,
// asked again with the same evidence, did not twice judge not to
// (`agreement.ts`): only two agreeing refutations fail a run whose every step
// succeeded.
//
// Everything it reaches outside itself is a port, for the reason
// `recovery/annotation/ports.ts` states: the service is a six-thousand-line
// class at its own line budget, and a path that can only be driven by standing
// up a project directory and a live run is a path nobody writes an assertion
// about.

import type { AutomationStudioRunDatasetPage, AutomationStudioRunDatasetSummary } from "@fluxiq/contracts/automation-studio";
import type { JsonObject } from "../../../../core/index.ts";
import type {
  AutomationStudioAdaptationPolicy,
  AutomationStudioFlowDocument,
  AutomationStudioFlowInstruction,
  AutomationStudioFlowRunDetail,
  AutomationStudioRuntimeSession
} from "../../model/index.ts";
import type { AutomationStudioLlmProvider, AutomationStudioLlmTokenLimits } from "../llm/index.ts";
import { AUTOMATION_STUDIO_RESULT_SUMMARY_LIMITS } from "../loop-limits/index.ts";
import {
  repairAutomationStudioRefutedRunResult,
  type AutomationStudioRefutedResultRepairPort
} from "../recovery/refuted-result/index.ts";
import { automationStudioResultVerificationFailsRun, type AutomationStudioResultVerificationOutcome, type AutomationStudioRunResultSummary } from "./contracts.ts";
import { automationStudioResultFailureRecord } from "./core-observation.ts";
import { summarizeAutomationStudioRunResult, type AutomationStudioResultRecordSetInput } from "./result-summary.ts";
import { automationStudioResultVerificationStatus } from "./verification-status.ts";
import { verifyAutomationStudioRunResult } from "./verify.ts";

/**
 * A resolver's answer, normalized to the one shape the verification reads.
 *
 * Core's provider resolver answers either a provider or a resolution around
 * one, and every caller has to tell them apart. Doing it here keeps that one
 * line out of the run service, which is at its own line budget, and keeps the
 * two shapes from being told apart twice and differently.
 */
export function automationStudioResultVerificationProvider(
  resolved: AutomationStudioLlmProvider | AutomationStudioResultVerificationProvider | undefined
): AutomationStudioResultVerificationProvider | undefined {
  if (!resolved) return undefined;
  return "provider" in resolved ? resolved : { provider: resolved };
}

/** The model that judges a result, with whatever the resolution bounds it to. */
export type AutomationStudioResultVerificationProvider = {
  provider: AutomationStudioLlmProvider;
  tokenLimits?: Partial<AutomationStudioLlmTokenLimits>;
  timeoutMs?: number;
  maxEstimatedCostUsd?: number;
};

/** Everything the verification reaches outside itself. */
export type AutomationStudioResultVerificationPorts = {
  /**
   * The run's stored record sets. Absent where the deployment stores no records
   * at all, which is a configuration and not a failure: a run that could never
   * have stored a record set has no result of this kind to judge, and the run
   * records that rather than a verdict.
   */
  listRunDatasets?: ((input: { projectId: string; runId: string }) => Promise<AutomationStudioRunDatasetSummary[]>) | undefined;
  getRunDatasetPage?: ((input: { projectId: string; runId: string; datasetId: string; limit?: unknown }) => Promise<AutomationStudioRunDatasetPage | null>) | undefined;
  flowInstructionSet(input: { projectId: string; flowId: string; subflowId?: string }): Promise<AutomationStudioFlowInstruction[]>;
  getFlowRunDetail(projectId: string, runId: string): Promise<AutomationStudioFlowRunDetail | null>;
  saveFlowRunDetail(detail: AutomationStudioFlowRunDetail): Promise<unknown>;
  writeRuntimeSession(projectId: string, session: AutomationStudioRuntimeSession): Promise<unknown>;
  /**
   * Resolves the model that judges this run's result, or answers nothing.
   *
   * Nothing means the question cannot be put at all -- no model is configured
   * for this Flow, or this run was not authorized to ask one. That is recorded
   * as a verification that did not happen, which is a different fact from a
   * verdict and must never be read as a pass.
   */
  resolveProvider?: ((input: { projectId: string; flowId: string }) => Promise<AutomationStudioResultVerificationProvider | undefined>) | undefined;
  /** The bound domain's declared denied keys. Absent means nobody declared any, and no row is sampled. */
  deniedEvidenceKeys?: readonly string[] | undefined;
  /**
   * Says what this check found on the run's own conversation thread.
   *
   * Handed the facts and Core's own words, never a composed sentence: what to
   * say, and whether a passing check says anything at all, is the schedule's to
   * decide (`result-check-schedule/conversation.ts`). Absent where the
   * deployment has no conversations, which is a configuration and not a
   * failure.
   */
  sayResultCheck?: ((input: { runId: string; status: string; checked: boolean; reason: string; observation: string; datasetId?: string }) => Promise<unknown>) | undefined;
  /**
   * Hands a run whose result was judged wrong back to the loop's failure entry
   * point, so the ladder repairs it as it repairs a failed step.
   *
   * Absent means nothing repairs a wrong answer here, and the verification's
   * verdict is a receipt again. That is the behaviour this port was added to
   * end, so it is left optional only because a deployment with no recovery
   * configured has nowhere to hand it.
   */
  repairRefutedResult?: AutomationStudioRefutedResultRepairPort | undefined;
};

export type AutomationStudioRuntimeSessionVerificationInput = {
  ports: AutomationStudioResultVerificationPorts;
  projectId: string;
  session: AutomationStudioRuntimeSession;
  /** The Flow that ran, for its authored shape. */
  flow?: AutomationStudioFlowDocument | undefined;
  subflowId?: string | undefined;
  policy?: AutomationStudioAdaptationPolicy | undefined;
  maxEstimatedCostUsd?: number | undefined;
  /**
   * What the checking schedule decided about this run, recorded whether or not
   * the run was checked.
   *
   * A run the schedule passed over is not silent about it. It still runs this
   * verification, still reaches `core.result.no_model_available` and is still
   * recorded `unverified` -- and it now carries the decision's own code and
   * sentence beside that, so a reader can tell "this run is not one the
   * schedule checks" from "nobody configured checking" from "the authorization
   * ran out". Absent for a caller with no schedule in force, which leaves that
   * caller's behaviour exactly as it was.
   */
  resultCheck?: { checked: boolean; epoch: number; code: string; reason: string } | undefined;
  signal?: AbortSignal | undefined;
};

/**
 * The session a run reports, after its result has been judged.
 *
 * The session that comes back is the one the caller returns to whoever started
 * the run, so a failed verification reaches the caller as a failed run and not
 * as a note filed somewhere.
 */
export async function verifyAutomationStudioRuntimeSessionResult(
  input: AutomationStudioRuntimeSessionVerificationInput
): Promise<AutomationStudioRuntimeSession> {
  if (input.session.status !== "succeeded") return input.session;
  const report = await runVerification(input);
  const outcome = report.outcome;
  const failing = outcome.performed === true && automationStudioResultVerificationFailsRun(outcome);
  const scheduled = recordedResultCheck(input, outcome);
  const recordedMetadata = { resultVerification: recordedOutcome(outcome), ...(scheduled ? { resultCheck: scheduled } : {}) };
  const next: AutomationStudioRuntimeSession = failing
    ? { ...input.session, status: "failed", metadata: { ...(input.session.metadata ?? {}), ...recordedMetadata } }
    : { ...input.session, metadata: { ...(input.session.metadata ?? {}), ...recordedMetadata } };
  await input.ports.writeRuntimeSession(input.projectId, next);
  const recorded = await recordOnRunDetail(input, next, outcome, report.interventions);
  // Only a run that was actually put to the question has anything to say. What
  // to say, and whether to say it at all, belongs to the schedule: this hands
  // over the facts and Core's own words, never the model's prose. It is said
  // before the repair below is entered, so the thread reads in the order the
  // run lived it: what the check found, then what was done about it.
  if (input.resultCheck && outcome.performed === true) {
    await input.ports.sayResultCheck?.({
      runId: input.session.runId,
      status: automationStudioResultVerificationStatus(outcome),
      checked: input.resultCheck.checked,
      reason: outcome.reason,
      observation: outcome.observation,
      ...(report.datasetId !== undefined ? { datasetId: report.datasetId } : {})
    });
  }
  // The half that makes a wrong answer repairable. A run that failed here
  // failed at `verification`, and until now that was the end of it: the ladder
  // is keyed on a failed *attempt*, a clean run has none, and the planner
  // answered `stop`. The run is handed to the same failure entry point every
  // other failure goes through, carrying the attempt the refutation amounts to.
  // It continues from the detail `recordOnRunDetail` just wrote, verdict and
  // schedule decision included, rather than re-reading the row it wrote.
  if (recorded && report.summary && input.ports.repairRefutedResult) {
    await repairAutomationStudioRefutedRunResult({
      runId: next.runId,
      detail: recorded,
      outcome,
      summary: report.summary,
      ...(input.flow ? { flow: input.flow } : {}),
      ...(input.subflowId ? { subflowId: input.subflowId } : {}),
      now: next.finishedAt ?? Date.now(),
      repair: input.ports.repairRefutedResult,
      saveFlowRunDetail: (detail) => input.ports.saveFlowRunDetail(detail)
    });
  }
  return next;
}

/**
 * The schedule's decision as the run record holds it, with the verdict this run
 * actually reached written beside it.
 *
 * `checked` is what tells a status that a check produced from a status that
 * nothing produced, and the run store keys its `result_verification_status`
 * column on exactly this: a run the schedule passed over writes null there,
 * which is a different fact from `unverified` and must stay so. `epoch` is the
 * Flow revision the run belongs to, which is what makes the count restart when
 * a repair lands.
 */
function recordedResultCheck(
  input: AutomationStudioRuntimeSessionVerificationInput,
  outcome: AutomationStudioResultVerificationOutcome
): JsonObject | undefined {
  const scheduled = input.resultCheck;
  if (!scheduled) return undefined;
  return { checked: scheduled.checked, epoch: scheduled.epoch, code: scheduled.code, reason: scheduled.reason, status: automationStudioResultVerificationStatus(outcome) };
}

type AutomationStudioRuntimeSessionVerificationReport = Awaited<ReturnType<typeof verifyAutomationStudioRunResult>> & {
  /** What the run produced, when it could be read. The repair is shown it; the verification was already. */
  summary?: AutomationStudioRunResultSummary;
  /**
   * The first record set the verification judged.
   *
   * The dataset id travels with the report so a conversation turn about a
   * refutation can attach the rows that were judged. It is an id, never a row:
   * what the person then opens is the stored record set, through the surface
   * that already has permission to show it.
   */
  datasetId?: string;
};

/** The verification, plus what the run produced and the first record set it judged. */
async function runVerification(input: AutomationStudioRuntimeSessionVerificationInput): Promise<AutomationStudioRuntimeSessionVerificationReport> {
  const session = input.session;
  let recordSets: AutomationStudioResultRecordSetInput[];
  try {
    recordSets = await readRecordSets(input.ports, input.projectId, session.runId);
  } catch (error) {
    // A result that could not be read is a result nobody checked, which is the
    // one thing this module refuses to report as success. The read's own code
    // is carried into the verdict so the run says what went wrong.
    return { outcome: unreadableResult(error), interventions: [] };
  }
  const summary = summarizeAutomationStudioRunResult({
    recordSets,
    ...(input.flow ? { flowNodes: input.flow.nodes } : {}),
    ...(input.ports.deniedEvidenceKeys !== undefined ? { deniedEvidenceKeys: input.ports.deniedEvidenceKeys } : {})
  });
  const datasetId = recordSets[0]?.summary.datasetId;
  if (summary.totalRecordCount === 0) {
    return { ...await verifyAutomationStudioRunResult({ projectId: input.projectId, flowId: session.flowId, runId: session.runId, summary, instructions: [] }), summary };
  }
  const instructions = await input.ports.flowInstructionSet({ projectId: input.projectId, flowId: session.flowId, ...(input.subflowId ? { subflowId: input.subflowId } : {}) });
  const resolved = await input.ports.resolveProvider?.({ projectId: input.projectId, flowId: session.flowId });
  const runDetail = await input.ports.getFlowRunDetail(input.projectId, session.runId);
  const report = await verifyAutomationStudioRunResult({
    projectId: input.projectId,
    flowId: session.flowId,
    runId: session.runId,
    ...(input.subflowId ? { subflowId: input.subflowId } : {}),
    summary,
    instructions,
    ...(runDetail ? { runDetail } : {}),
    ...(input.ports.deniedEvidenceKeys !== undefined ? { deniedEvidenceKeys: input.ports.deniedEvidenceKeys } : {}),
    ...(resolved ? { provider: resolved.provider } : {}),
    ...(input.policy ? { policy: input.policy } : {}),
    ...(resolved?.tokenLimits ? { tokenLimits: resolved.tokenLimits } : {}),
    ...(resolved?.timeoutMs !== undefined ? { timeoutMs: resolved.timeoutMs } : {}),
    ...(costCeiling(input, resolved) !== undefined ? { maxEstimatedCostUsd: costCeiling(input, resolved) } : {}),
    ...(input.signal ? { signal: input.signal } : {})
  });
  return { summary, ...report, ...(datasetId !== undefined ? { datasetId } : {}) };
}

/** The narrower of what the caller allows this call and what the resolution allows it. */
function costCeiling(
  input: AutomationStudioRuntimeSessionVerificationInput,
  resolved: AutomationStudioResultVerificationProvider | undefined
): number | undefined {
  const ceilings = [input.maxEstimatedCostUsd, resolved?.maxEstimatedCostUsd].filter((value): value is number => typeof value === "number" && value > 0);
  return ceilings.length ? Math.min(...ceilings) : undefined;
}

/**
 * The run's stored record sets, each with the rows Core checks for required
 * values and, of those, the first few a sample may be drawn from.
 *
 * One read serves both: the check needs more rows than a sample does, and a
 * sample is the head of the same page. The sample keeps its own, smaller
 * source, so what the model may be shown -- and whether the summary calls
 * itself partial -- is exactly what it was before the check read further.
 */
async function readRecordSets(
  ports: AutomationStudioResultVerificationPorts,
  projectId: string,
  runId: string
): Promise<AutomationStudioResultRecordSetInput[]> {
  if (!ports.listRunDatasets) return [];
  const readPage = ports.getRunDatasetPage;
  const limits = AUTOMATION_STUDIO_RESULT_SUMMARY_LIMITS;
  const summaries = await ports.listRunDatasets({ projectId, runId });
  const listed = summaries.slice(0, limits.maxRecordSets);
  return await Promise.all(listed.map(async (summary) => {
    const page = readPage && summary.recordCount > 0
      ? await readPage({ projectId, runId, datasetId: summary.datasetId, limit: limits.maxRowsCheckedPerSet })
      : null;
    if (!page) return { summary };
    const checkedRows = page.rows.slice(0, limits.maxRowsCheckedPerSet);
    return { summary, schema: page.schema, rows: checkedRows.slice(0, limits.maxSampleRowsPerSet), checkedRows };
  }));
}

function unreadableResult(error: unknown): AutomationStudioResultVerificationOutcome {
  const code = "core.result.unreadable";
  const observation = `The run's stored records could not be read: ${errorName(error)}.`;
  return {
    schemaVersion: "automation-studio.result-verification.v1",
    performed: true,
    verdict: "unsure",
    basis: "model_unavailable",
    code,
    reason: "What the run produced could not be read, so whether it answers the request was never judged.",
    observation,
    failure: automationStudioResultFailureRecord({ verdict: "unsure", code, observation })
  };
}

/** The error's own name, never its message: a message can carry what the store was holding. */
function errorName(error: unknown): string {
  return error instanceof Error && error.name ? error.name : "unknown error";
}

/**
 * The verification as a run record holds it: verdicts, codes and Core's own
 * words, led by the one word a reader of the run acts on. `status` is what
 * keeps a result nobody judged from reading as a result that was right.
 * `verdicts` and `calls` say what each model call answered and how many were
 * made, so a result judged twice reads as such; they are absent when no model
 * was asked.
 */
function recordedOutcome(outcome: AutomationStudioResultVerificationOutcome): JsonObject {
  const status = automationStudioResultVerificationStatus(outcome);
  if (outcome.performed === false) return { status, performed: false, code: outcome.code, reason: outcome.reason };
  return {
    status,
    performed: true,
    verdict: outcome.verdict,
    basis: outcome.basis,
    code: outcome.code,
    reason: outcome.reason,
    observation: outcome.observation,
    ...(outcome.verdicts ? { verdicts: [...outcome.verdicts] } : {}),
    ...(outcome.calls !== undefined ? { calls: outcome.calls } : {})
  };
}

async function recordOnRunDetail(
  input: AutomationStudioRuntimeSessionVerificationInput,
  session: AutomationStudioRuntimeSession,
  outcome: AutomationStudioResultVerificationOutcome,
  interventions: Awaited<ReturnType<typeof verifyAutomationStudioRunResult>>["interventions"]
): Promise<AutomationStudioFlowRunDetail | undefined> {
  const detail = await input.ports.getFlowRunDetail(input.projectId, session.runId);
  if (!detail) return undefined;
  const failed = outcome.performed === true && automationStudioResultVerificationFailsRun(outcome);
  const scheduled = recordedResultCheck(input, outcome);
  // Answered as well as saved, because the repair that may follow continues
  // from exactly this record: re-reading it would be a second read of a row
  // this call just wrote, and a repair built from a stale one would annotate a
  // run detail that no longer carries its own verdict.
  const recorded: AutomationStudioFlowRunDetail = {
    ...detail,
    summary: {
      ...detail.summary,
      status: session.status,
      updatedAt: session.finishedAt ?? detail.summary.updatedAt,
      // On the summary as well as the detail, because the summary is what the
      // run store writes its row from: `result_verification_status` and
      // `result_check_epoch` are read from exactly this, and they are what the
      // next run's schedule counts.
      ...(scheduled ? { metadata: { ...(detail.summary.metadata ?? {}), resultCheck: scheduled } } : {})
    },
    ...(interventions.length ? { interventions: [...detail.interventions, ...interventions] } : {}),
    metadata: {
      ...(detail.metadata ?? {}),
      resultVerification: recordedOutcome(outcome),
      ...(scheduled ? { resultCheck: scheduled } : {}),
      ...(failed && outcome.performed === true && outcome.failure ? { resultVerificationFailure: { category: outcome.failure.category, code: outcome.failure.code } } : {})
    }
  };
  await input.ports.saveFlowRunDetail(recorded);
  return recorded;
}
