// One question, asked after a run has finished: does what came back answer
// what was asked for?
//
// **At most two checks, never a loop.** A verification is not an investigation.
// It is shown the request, the shape of the Flow that ran, and a bounded account
// of the result, and it answers in one field: `yes`, `no` or `unknown`.
//
// **Anything but `yes` is asked once more, with the same evidence.** A `no`
// or an `unknown` fails a run whose every step succeeded, and at temperature 0
// both were measured to flip on identical rows (2026-09-18, 2026-09-21). The
// second call is the first one repeated, not a new question; `agreement.ts`
// says what the two answers come to. Only two agreeing `no`s fail the run;
// every other pair that is not a `yes` first leaves it `unverified`. A first
// check that gave no answer at all is not followed by a second and fails closed.
//
// **A check that did not come back for a temporary reason is asked again
// (t473).** A call that ran past its deadline, or met a fault the adapter
// calls temporary that the provider retry policy could not get past, gave no
// answer, not a wrong one. That policy deliberately leaves a timeout to "the
// loop above" (`../llm/provider-retry/decision.ts`, `NEVER_ASKED_AGAIN`), and
// for a verification this is that loop: each check is asked up to
// `AUTOMATION_STUDIO_RESULT_VERIFICATION_ASKS_PER_CHECK` times with the same
// evidence, each ask a call of its own under the run's budget or the build's
// purse. Live run `run-mv5q4j5c-49bfb5e2` cut a judge off at 19,985 ms, never
// asked it again, and re-ran a whole 84-second trial for a 5-second answer. A
// fault that is not temporary -- a refusal by the purse, a refused key, a
// cancellation -- is not asked again.
//
// **A reply that arrived and could not be read is asked again too (t515).**
// Live run `run-mv6v2kzn-d593231f` step 0088: the result check's one reply
// looped a sentence until it was cut off at 8,192 tokens
// (`llm.provider_output_truncated`), was read as no verdict, and failed the
// run as refuted. Core's own LLM policy calls such a reply a spent call -- the
// next may succeed (`../llm/failure-disposition.ts`, `spend_call`) -- and so
// does this check now: any spent call, or a reply the harness could not
// validate (`llm_output.*`), is asked again under the same bound of
// `AUTOMATION_STUDIO_RESULT_VERIFICATION_ASKS_PER_CHECK`, one extra ask.
//
// **A reply cut off after its verdict is read for that verdict (t653).** Live
// run `run-mva6mlo8-f519063c`: four of 21 judge replies looped inside `summary`
// to the provider's 8,192-token ceiling and were lost, each a fresh draw on
// retry. The verification now asks for `kind` and `diagnosis` before `summary`,
// and the reply envelope reads a cut reply whose diagnosis closed before the
// cut and marks it with the typed field `truncatedAfterVerdict: true`, which is
// what this reads -- never the plain sentence the adapter puts in place of the
// cut summary -- and the call's intervention is marked the same. The cut
// summary is never read. A no or an unknown read so is the answer it gave. A
// yes is read from its whole fields only and counts only if it passes there
// every check a yes must pass; otherwise the quotes or row names it owes may be
// in what was cut, so it gave no answer and is asked again as before. This
// reads what the model wrote and caps nothing.
//
// **A build's test confirms a `yes` as well (`confirmAnswer`).** The build-test
// judge's `yes` finishes a build, and in live run murwcmx2 one `yes` to a
// request answered `no` before finished it on rows the playback judge refused.
// A request that sets `confirmAnswer` asks a first `yes` once more with the same
// evidence; a second `no` leaves it unsure (`agreement.ts`). The runtime result
// check does not set it, and a first `yes` there still stands on one call.
//
// **An unsure beside a yes whose doubt Core's record contradicts is asked once
// more (t503).** Lane C round 17 (`run-mv6lgqi6-4bfab2e1`, trial 3): one check
// could not tell because later pages were never read, where every paging read's
// own account said its list ended, and the other said yes. That check is asked
// a third time, once, with Core's record named on its copy (`recheck`); its
// answer takes its place under the same rule (`agreement.ts`). The call's
// intervention says so (`verificationReask`).
//
// **Core's own counts are asked first and cost nothing.** A run whose every row
// was refused, or whose rows lack a value their own schema requires, is settled
// before a provider is even resolved.
//
// **An empty result is judged like any other, and that is new.** Until
// 2026-09-24 a run that stored no rows -- an empty record set, or no record set
// at all -- was exempt: it was recorded as not checked and never put to a
// model, because a verification reached from an empty result had once entered
// provider resolution and never returned (2026-09-20, t024). That exemption
// made the single most obviously wrong answer a run can give -- an empty table
// where the person asked for rows -- the one case nothing ever looked at, and
// because nothing refuted it, nothing repaired it either. The hang is now
// bounded rather than avoided (`deadline.ts`), and an empty result reaches the
// same question every other result reaches. It can be answered `yes`: "if
// nothing matches, an empty table is the right answer" is a request a Flow
// satisfies by finding nothing, and only a reading of the request tells that
// from an extraction that found nothing because it never looked.
//
// **`loop_verification` is the task kind, and it needed no new output shape.**
// The kind has existed since the loop protocol was written -- described in its
// own file as "a verdict on whether a change worked" -- and was never called.
// It expects the diagnosis envelope, which already carries three-word verdicts;
// the verdict this call is for is one more of them, `answersRequest`. That is
// the whole of the extension: one field in a channel that is already named,
// bounded, schema-declared and checked at the boundary.
//
// **The call is deliberately made outside the stage protocol.** The protocol's
// order starts at `gather` and a run may not begin part-way through it, so a
// standalone `verify` would be refused by Core's own ordering rule and the
// refusal would be right: this is not the fifth stage of a recovery, it is a
// check every finished run gets whether or not a recovery ever happened.

import type { AutomationStudioAdaptationPolicy, AutomationStudioFlowInstruction, AutomationStudioFlowIntervention, AutomationStudioFlowRunDetail } from "../../model/index.ts";
import {
  automationStudioLlmProviderFailureSpendsCall,
  runAutomationStudioLlmHarness,
  type AutomationStudioLlmProvider,
  type AutomationStudioLlmRunBudgetLedger,
  type AutomationStudioLlmTokenLimits
} from "../llm/index.ts";
import type { AutomationStudioResultVerificationOutcome, AutomationStudioRunResultSummary } from "./contracts/index.ts";
import { automationStudioResultVerificationAgreement, automationStudioResultVerificationAskAgain, automationStudioResultVerificationReaskContradicted } from "./agreement/index.ts";
import { automationStudioResultCheckActivity } from "./check-activity.ts";
import { automationStudioResultCoreObservation } from "./core-observation.ts";
import { automationStudioResultSummaryWithPagingWords, automationStudioResultSummaryWithUnreadColumns } from "./read-account/index.ts";
import { automationStudioRequestWording, automationStudioResultSummaryWithAlsoInResult, automationStudioResultSummaryWithLeftOutNamingTheItem, automationStudioResultSummaryWithRowIds } from "./request-rows/index.ts";
import { automationStudioResultReaskNarrowingNo } from "./unsure-doubts/index.ts";
import { automationStudioResultVerdict } from "./verdict/index.ts";
import { automationStudioResultAdviceKept, automationStudioResultExclusionEvidenceRecheck } from "./exclusion-evidence/index.ts";
import { emitAutomationStudioActivity } from "../activity/index.ts";

/**
 * Core's codes for a run that was not verified, and why. Never a verdict.
 *
 * Two codes used to live here and no longer do, because the cases they named
 * are now judged rather than skipped: `core.result.nothing_to_judge`, for a run
 * that stored no record set, and `core.result.no_records`, for a record set
 * holding no rows. Both are still readable on runs recorded before 2026-09-24,
 * and `verification-status.ts` still maps the first to the `no_result` status a
 * stored run may carry; nothing produces either any more.
 *
 * What is left is the two ways a question can fail to be put at all: no model
 * to put it to, and a verification that did not finish inside its deadline
 * (`deadline.ts`). Both are `performed: false`, both read as `unverified`, and
 * neither is ever a pass.
 */
export const AUTOMATION_STUDIO_RESULT_VERIFICATION_SKIP_CODES = Object.freeze({
  noModel: "core.result.no_model_available",
  /** The verification did not settle inside its deadline, or the run was cancelled under it. */
  notFinished: "core.result.verification_did_not_finish"
} as const);

export type AutomationStudioResultVerificationRequest = {
  projectId: string;
  flowId: string;
  runId: string;
  subflowId?: string | undefined;
  /** What the run produced, already bounded and screened. */
  summary: AutomationStudioRunResultSummary;
  /** The request, as the Flow's own instructions state it. */
  instructions: readonly AutomationStudioFlowInstruction[];
  /** The finished run, for the steps it actually attempted. */
  runDetail?: AutomationStudioFlowRunDetail | undefined;
  /** The bound domain's declared denied keys. Required once anything is sent. */
  deniedEvidenceKeys?: readonly string[] | undefined;
  provider?: AutomationStudioLlmProvider | undefined;
  policy?: AutomationStudioAdaptationPolicy | undefined;
  tokenLimits?: Partial<AutomationStudioLlmTokenLimits> | undefined;
  timeoutMs?: number | undefined;
  maxEstimatedCostUsd?: number | undefined;
  runBudget?: AutomationStudioLlmRunBudgetLedger | undefined;
  signal?: AbortSignal | undefined;
  now?: (() => number) | undefined;
  /**
   * True to confirm a first `answers` with a second call, as a first answer of
   * anything else already is (`agreement.ts`). Set only by the build-test judge,
   * whose `yes` finishes a build; the runtime result check leaves it unset.
   */
  confirmAnswer?: boolean | undefined;
  /** Completed receipts survive a later check's outer deadline; this does not count dispatches. */
  recordIntervention?: ((intervention: AutomationStudioFlowIntervention) => void) | undefined;
};

/** The outcome, and the intervention record of each call made: none, one, two, or three with a re-ask (header, t503). */
export type AutomationStudioResultVerificationReport = {
  outcome: AutomationStudioResultVerificationOutcome;
  /**
   * In the order the calls were made. Each carries
   * `metadata.source: "verifyAutomationStudioRunResult"` and
   * `metadata.verificationCheck` (1 or 2), and a re-ask `verificationReask`, so
   * a reader of the run can tell a verification call from a recovery's.
   */
  interventions: AutomationStudioFlowIntervention[];
};

/** Where a verification call's intervention says it came from. */
const VERIFICATION_SOURCE = "verifyAutomationStudioRunResult";

/**
 * How many times one check is asked when its call did not come back for a
 * temporary reason: the first ask, and once more (header). A verification
 * makes at most twice this many calls.
 */
export const AUTOMATION_STUDIO_RESULT_VERIFICATION_ASKS_PER_CHECK = 2;

export async function verifyAutomationStudioRunResult(request: AutomationStudioResultVerificationRequest): Promise<AutomationStudioResultVerificationReport> {
  const core = automationStudioResultCoreObservation(request.summary);
  if (core) return { outcome: { ...core, performed: true }, interventions: [] };
  const provider = request.provider;
  if (!provider) {
    return {
      interventions: [],
      outcome: {
        schemaVersion: "automation-studio.result-verification.v1",
        performed: false,
        code: AUTOMATION_STUDIO_RESULT_VERIFICATION_SKIP_CODES.noModel,
        reason: "No model was available to judge this run's result -- none is configured for this Flow, or this run was not authorized to ask one -- so whether the result answers the request was never judged."
      }
    };
  }
  emitAutomationStudioActivity({ phase: "verifying", label: "Checking the result answers the request", detail: { kind: "check", title: "Result check started", status: "started" } });
  const confirmAnswer = request.confirmAnswer === true;
  const interventions: AutomationStudioFlowIntervention[] = [];
  const first = await askCheck(request, provider, 1, interventions);
  if (!automationStudioResultVerificationAskAgain(first, { confirmAnswer })) {
    return said({ outcome: { ...automationStudioResultVerificationAgreement({ first }), performed: true }, interventions });
  }
  const second = await askCheck(request, provider, 2, interventions);
  // The request as the judges read it: a split's no whose advice excludes by words it never states is marked and asked again (t515, `./agreement.ts`).
  const wording = automationStudioRequestWording(request.instructions, request.summary);
  // The summary and the request's text: Core's record a no's every reason is weighed against (t607, `./refuted-no/`).
  const requestText = request.instructions.map((instruction) => `${instruction.title}\n${instruction.body}`).join("\n");
  const input = { first, second, confirmAnswer, reads: request.summary.reads, recordSets: request.summary.recordSets, wording, summary: request.summary, requestText };
  const settled = automationStudioResultVerificationAgreement(input);
  // A contradicted unsure beside a yes is asked once more, with Core's record named (header, t503); so is a split's no
  // whose advice adds an exclusion the request never states (t515), and each no whose every reason Core's record
  // refutes (t607). The agreement names the call to ask.
  const ask = (recheck: string, call: 1 | 2) => askCheck({ ...request, summary: { ...request.summary, recheck } }, provider, call, interventions, true);
  const reasked = await automationStudioResultVerificationReaskContradicted({ ...input, settled, ask });
  // Where nothing was asked again, a no blaming only steps that chose the request's own words is asked once more (t666, `./unsure-doubts/narrowing-no-reask.ts`).
  const outcome = await automationStudioResultReaskNarrowingNo({
    settled: reasked, first, second, reads: request.summary.reads, requestText, says: wording?.says, ask,
    agree: (one, two) => automationStudioResultVerificationAgreement({ ...input, first: one, second: two })
  });
  return said({ outcome: { ...outcome, performed: true }, interventions });
}

/**
 * One check, asked again while its call did not come back for a temporary
 * reason, up to `AUTOMATION_STUDIO_RESULT_VERIFICATION_ASKS_PER_CHECK` asks
 * (header). Every ask's intervention is recorded, in order, under a name of its
 * own: two calls can finish within one millisecond of each other, and the
 * harness names an intervention by the run and the time.
 */
async function askCheck(
  request: AutomationStudioResultVerificationRequest,
  provider: AutomationStudioLlmProvider,
  check: 1 | 2,
  interventions: AutomationStudioFlowIntervention[],
  /** The one re-ask of a contradicted unsure (header, t503): marked on its intervention. */
  reask = false
): Promise<ReturnType<typeof automationStudioResultVerdict>> {
  let current = request;
  let evidenceRecheck = false;
  // A held yes that advised a change: the call keeps that advice through its recheck (`./exclusion-evidence/advice-kept.ts`, t636).
  let advised: ReturnType<typeof automationStudioResultVerdict> | undefined;
  for (let ask = 1; ; ask += 1) {
    const reply = await askOnce(current, provider, check, ask, reask, evidenceRecheck);
    const asked: typeof reply = advised ? { ...reply, verification: automationStudioResultAdviceKept(reply.verification, advised) } : reply;
    if (asked.verification.changeAdvised) advised = asked.verification;
    const taken = new Set(interventions.map((intervention) => intervention.interventionId));
    const intervention = taken.has(asked.intervention.interventionId) ? { ...asked.intervention, interventionId: `${asked.intervention.interventionId}.${interventions.length + 1}` } : asked.intervention;
    interventions.push(intervention);
    request.recordIntervention?.(intervention);
    const correction = automationStudioResultExclusionEvidenceRecheck(asked.verification, request.deniedEvidenceKeys);
    if ((!asked.temporary && !correction) || ask >= AUTOMATION_STUDIO_RESULT_VERIFICATION_ASKS_PER_CHECK || request.signal?.aborted) return asked.verification;
    if (correction) {
      current = { ...request, summary: { ...request.summary, recheck: [request.summary.recheck, correction].filter(Boolean).join("\n") } };
      evidenceRecheck = true;
    }
  }
}

/** The check's verdict, said in the chat as the check that was started ends (`check-activity.ts`), and returned unchanged. */
function said(report: AutomationStudioResultVerificationReport): AutomationStudioResultVerificationReport {
  const words = automationStudioResultCheckActivity(report.outcome);
  emitAutomationStudioActivity({ phase: "verifying", label: words.label, detail: { kind: "check", title: "Result check", status: words.status, ...(words.text ? { text: words.text } : {}) } });
  return report;
}

/**
 * One verification call and the verdict it reached. The second call of a
 * verification is this one repeated: the same request, the same evidence.
 * `temporary` when it gave no reply because of a fault that is asked again
 * (`askAgainAfter`): one the adapter called temporary -- its deadline passing
 * among them -- or a reply that arrived and could not be read, and the caller
 * was not cancelled.
 */
async function askOnce(
  request: AutomationStudioResultVerificationRequest,
  provider: AutomationStudioLlmProvider,
  check: 1 | 2,
  ask: number,
  reask: boolean,
  evidenceRecheck: boolean
): Promise<{ verification: ReturnType<typeof automationStudioResultVerdict>; intervention: AutomationStudioFlowIntervention; temporary: boolean }> {
  // With the instruction's named columns no stored column reads, said once
  // (`read-account/unread-columns.ts`): information for the judge, not a verdict.
  // And the rows a condition alone left out that name the asked item
  // (`request-rows/`, live run `run-muw60j7c-bb7c9a62`, C-2), on both kinds of
  // judge's copy: the verdict is read with the same rows, so a yes is held to
  // the rows the judge was shown. The rows are flagged before the paging words:
  // the paging copy drops each condition's `testedLabel`, which the flagging
  // reads and the judge is never shown (`run-mux6naez-6c20f26e`). Last, Core's
  // short id before each left-out row a judge must still name
  // (`request-rows/summary-with-row-ids.ts`, t599): the judge's copy only, and
  // the verdict reads the rows without it. Before the ids, each left-out row
  // whose item is also in the result is said so (`request-rows/summary-with-also-in-result.ts`,
  // t624), and needs no id: no yes is asked to name it.
  const judged = automationStudioResultSummaryWithRowIds(automationStudioResultSummaryWithAlsoInResult(automationStudioResultSummaryWithPagingWords(automationStudioResultSummaryWithLeftOutNamingTheItem(
    automationStudioResultSummaryWithUnreadColumns(request.summary, request.instructions),
    request.instructions
  ))));
  const result = await runAutomationStudioLlmHarness({
    taskKind: "loop_verification",
    projectId: request.projectId,
    flowId: request.flowId,
    runId: request.runId,
    ...(request.subflowId ? { subflowId: request.subflowId } : {}),
    instructions: [...request.instructions],
    ...(request.runDetail ? { runDetail: request.runDetail } : {}),
    resultSummary: judged,
    ...(request.deniedEvidenceKeys ? { deniedEvidenceKeys: request.deniedEvidenceKeys } : {}),
    ...(request.policy ? { policy: request.policy } : {}),
    provider,
    ...(request.runBudget ? { runBudget: request.runBudget } : {}),
    // No reply cap (user, 2026-10-03, t254: it was 2,000 since t239). Under a build's purse the judge's reply is held at its observed-maximum reserve (`../llm/build-purse/build-call-reserves.ts`).
    ...withDefined("tokenLimits", request.tokenLimits),
    ...(request.timeoutMs !== undefined ? { timeoutMs: request.timeoutMs } : {}),
    ...(request.maxEstimatedCostUsd !== undefined ? { maxEstimatedCostUsd: request.maxEstimatedCostUsd } : {}),
    ...(request.signal ? { signal: request.signal } : {}),
    ...(request.now ? { now: request.now } : {}),
    metadata: { source: VERIFICATION_SOURCE, expectedOutput: "diagnosis" }
  });
  const response = result.ok && result.response?.kind === "diagnosis" ? result.response : undefined;
  // A reply cut off after its verdict (header, t653), by the adapter's typed mark: read from its kind and diagnosis alone, never its summary.
  const truncatedAfterVerdict = response?.truncatedAfterVerdict === true;
  // The run's own summary, with the flagged rows the judge was shown: the
  // judge's paging words are not Core's observation.
  const summary = judged.leftOutNamingTheItem ? { ...request.summary, leftOutNamingTheItem: judged.leftOutNamingTheItem } : request.summary;
  // A yes over a row a condition alone left out quotes, beside it, the request's own words that exclude it (t515, `./verdict/`).
  const wording = automationStudioRequestWording(request.instructions, request.summary);
  const read = automationStudioResultVerdict({
    summary,
    ...(response?.diagnosis ? { diagnosis: response.diagnosis } : {}),
    // The reply's own prose, carried only as the judgement's advice where the
    // diagnosis channel's `changed` gave none. The verdict reader screens and
    // bounds it; nothing here is required of the model.
    ...(response?.summary && !truncatedAfterVerdict ? { summaryText: response.summary } : {}),
    basis: response ? "model" : "model_unavailable",
    wording,
    ...(response ? {} : { failureCode: firstErrorCode(result.diagnostics) })
  });
  // A cut yes its whole fields do not carry gave no answer, and is asked again as a cut reply always was (header, t653).
  const unreadYes = truncatedAfterVerdict && response?.diagnosis?.answersRequest === "yes" && read.verdict !== "answers";
  const verification = unreadYes ? automationStudioResultVerdict({ summary, basis: "model_unavailable", failureCode: CUT_REPLY_CODE, wording }) : read;
  // The harness records a call's own metadata, not the caller's, so the
  // intervention is told here which check it was and who asked.
  const intervention = { ...result.intervention, metadata: { ...(result.intervention.metadata ?? {}), source: VERIFICATION_SOURCE, verificationCheck: check, ...(ask > 1 ? { verificationAsk: ask } : {}), ...(reask ? { verificationReask: true } : {}), ...(evidenceRecheck ? { verificationEvidenceRecheck: true } : {}), ...(truncatedAfterVerdict ? { truncatedAfterVerdict: true } : {}) } };
  const temporary = request.signal?.aborted !== true && (unreadYes || (!response && askAgainAfter(firstError(result.diagnostics))));
  return { verification, intervention, temporary };
}

/** The code a cut reply's unread yes is recorded under: the reply was cut off, as it was before its verdict could be read (t653). */
const CUT_REPLY_CODE = "llm.provider_output_truncated";

/**
 * Whether a call that gave no verdict is asked again (header): a fault the
 * adapter called temporary, or a call Core's LLM policy calls spent -- the
 * reply or the network failed, and the next call may succeed -- or a reply the
 * harness could not validate. Never a refused key, a purse's refusal or a
 * cancellation.
 */
function askAgainAfter(error: { code: string; metadata?: Record<string, unknown> | undefined } | undefined): boolean {
  if (!error) return false;
  if (error.metadata?.retryable === true) return true;
  if (error.code.startsWith("llm_output.")) return true;
  const status = error.metadata?.providerStatus;
  return automationStudioLlmProviderFailureSpendsCall({ code: error.code, status: typeof status === "number" ? status : undefined });
}

/** `{ [key]: value }`, or nothing when the value is undefined, for an optional field that may not be set to `undefined`. */
function withDefined<K extends string, V>(key: K, value: V | undefined): { [P in K]?: V } {
  return value === undefined ? {} : ({ [key]: value } as { [P in K]?: V });
}

/** The first error code a failed call reported. Codes only: a provider's message never reaches a run record. */
function firstErrorCode(diagnostics: readonly { severity: string; code: string }[]): string | undefined {
  return firstError(diagnostics)?.code;
}

/** The first error a failed call reported: the provider's fault, whose `metadata.retryable` is the adapter's verdict on it. */
function firstError<T extends { severity: string }>(diagnostics: readonly T[]): T | undefined {
  return diagnostics.find((diagnostic) => diagnostic.severity === "error");
}
