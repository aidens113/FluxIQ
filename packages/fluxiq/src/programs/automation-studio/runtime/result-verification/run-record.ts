// What a finished run's result check writes on the run it judged: the verdict
// as the run record holds it (Core's words and codes, never the model's prose),
// the schedule's decision beside it, the run detail carrying both and the
// versions it was about, the judgement against each version the run executed,
// and -- for a run that asked no model anything -- the replay evidence the
// confidence rule counts.
//
// Moved out of `./run-outcome.ts` (t286), which had reached its 800-line
// limit: that module decides and sequences the check; this is the record it
// leaves. Nothing here decides anything.

import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioFlowRunDetail, AutomationStudioRuntimeSession } from "../../model/index.ts";
import {
  automationStudioMetadataWithFlowVersions,
  type AutomationStudioFlowGraphVersion,
  type AutomationStudioJudgedFlowGraphVersion
} from "../flow-version/index.ts";
import { automationStudioResultVerificationFailsRun, type AutomationStudioResultVerificationOutcome } from "./contracts.ts";
import { automationStudioRecordedResultRepair } from "./repair-directive.ts";
import type { AutomationStudioRuntimeSessionVerificationInput } from "./run-outcome.ts";
import { automationStudioResultVerificationStatus } from "./verification-status.ts";
import type { verifyAutomationStudioRunResult } from "./verify.ts";
import { automationStudioZeroProviderGate } from "./zero-provider-run.ts";

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
export function automationStudioResultRecordedCheck(
  input: AutomationStudioRuntimeSessionVerificationInput,
  outcome: AutomationStudioResultVerificationOutcome
): JsonObject | undefined {
  const scheduled = input.resultCheck;
  if (!scheduled) return undefined;
  return { checked: scheduled.checked, epoch: scheduled.epoch, code: scheduled.code, reason: scheduled.reason, status: automationStudioResultVerificationStatus(outcome) };
}

/**
 * The verification as a run record holds it: verdicts, codes and Core's own
 * words, led by the one word a reader of the run acts on. `status` is what
 * keeps a result nobody judged from reading as a result that was right.
 * `verdicts` and `calls` say what each model call answered and how many were
 * made, so a result judged twice reads as such; they are absent when no model
 * was asked.
 *
 * **A refutation's directive is recorded, and only Core's half of it.**
 * `findings` and `fix` are Core's arithmetic and Core's sentences, so they belong
 * on a run like the observation beside them -- and a person or a later agent
 * reading a failed run is now told what to fix rather than only that something
 * was wrong. `judgement` is the model's reading of a medium whose contents Core
 * does not store, so it is deliberately not here; it reaches the repair inside
 * the failure record, which is where a sentence written outside Core travels
 * (`core-observation.ts` says why that is the only route). `withheld` is recorded
 * because it is a fact about the directive rather than a quotation: it says
 * something the check offered was screened out.
 */
export function automationStudioResultRecordedOutcome(outcome: AutomationStudioResultVerificationOutcome): JsonObject {
  const status = automationStudioResultVerificationStatus(outcome);
  if (outcome.performed === false) return { status, performed: false, code: outcome.code, reason: outcome.reason, ...(outcome.failureCode ? { failureCode: outcome.failureCode } : {}) };
  return {
    status,
    performed: true,
    verdict: outcome.verdict,
    basis: outcome.basis,
    code: outcome.code,
    reason: outcome.reason,
    observation: outcome.observation,
    ...(outcome.verdicts ? { verdicts: [...outcome.verdicts] } : {}),
    ...(outcome.calls !== undefined ? { calls: outcome.calls } : {}),
    ...(outcome.repair ? { repair: automationStudioRecordedResultRepair(outcome.repair) } : {}),
    ...(outcome.failureCode ? { failureCode: outcome.failureCode } : {})
  };
}

/**
 * The verdict, written against every version the run executed.
 *
 * Only a version with a revision number is offered. A graph Flow with no
 * revision chain -- one that existed before its graph was ever indexed -- is
 * carried on the run as `revision: null`, and null is not a version: writing it
 * as 0 would invent a predecessor nobody ever confirmed, which is exactly the
 * comparison the whole design refuses to make.
 *
 * A deployment with no store for these records nothing and says nothing. The
 * run's own detail still carries its version set, so which version a result
 * belongs to is still answerable there; only the history across runs is absent.
 */
export async function automationStudioResultRecordFlowGraphJudgements(
  input: AutomationStudioRuntimeSessionVerificationInput,
  outcome: AutomationStudioResultVerificationOutcome,
  flowVersions: readonly AutomationStudioFlowGraphVersion[],
  instructionDigest: string | null,
  decidedAtMs: number
): Promise<void> {
  const record = input.ports.recordFlowGraphJudgements;
  if (!record) return;
  const versions = flowVersions.filter((version): version is AutomationStudioJudgedFlowGraphVersion => typeof version.revision === "number");
  if (!versions.length) return;
  await record({
    projectId: input.projectId,
    judgement: {
      runId: input.session.runId,
      status: automationStudioResultVerificationStatus(outcome),
      code: outcome.code,
      instructionDigest,
      decidedAtMs,
      versions
    }
  });
}

export async function automationStudioResultRecordOnRunDetail(
  input: AutomationStudioRuntimeSessionVerificationInput,
  session: AutomationStudioRuntimeSession,
  outcome: AutomationStudioResultVerificationOutcome,
  interventions: Awaited<ReturnType<typeof verifyAutomationStudioRunResult>>["interventions"],
  flowVersions: readonly AutomationStudioFlowGraphVersion[],
  verificationSettled: boolean
): Promise<{ detail: AutomationStudioFlowRunDetail; askedNoModel: boolean } | undefined> {
  const detail = await input.ports.getFlowRunDetail(input.projectId, session.runId);
  if (!detail) return undefined;
  // In this save and no other, so the verdict and the run's zero cost are one write.
  const zeroGate = automationStudioZeroProviderGate(detail, interventions, verificationSettled);
  const failed = outcome.performed === true && automationStudioResultVerificationFailsRun(outcome);
  const scheduled = automationStudioResultRecordedCheck(input, outcome);
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
      // The version set goes beside the verdict, not somewhere else: a reader
      // of one run has one place to look for what was judged and what it was
      // judged about. It is written from the session rather than left to the
      // detail's own projection, because a run whose detail was rebuilt from
      // some other source would otherwise carry a verdict about a version it
      // does not name.
      ...automationStudioMetadataWithFlowVersions(detail.metadata, flowVersions),
      resultVerification: automationStudioResultRecordedOutcome(outcome),
      ...(scheduled ? { resultCheck: scheduled } : {}),
      ...(failed && outcome.performed === true && outcome.failure ? { resultVerificationFailure: { category: outcome.failure.category, code: outcome.failure.code } } : {}),
      ...(zeroGate ? { llmGate: zeroGate } : {})
    }
  };
  await input.ports.saveFlowRunDetail(recorded);
  return { detail: recorded, askedNoModel: zeroGate !== undefined };
}

/**
 * Hands a run that asked no model anything to the replay recorder the service
 * lends. Evidence about the changes the run executed, never a condition of the
 * run: the run has finished, and a store that refused the write leaves each
 * change where it stood.
 */
export async function automationStudioResultRecordAdaptationReplays(input: AutomationStudioRuntimeSessionVerificationInput, session: AutomationStudioRuntimeSession): Promise<void> {
  if (!session.trace || !input.ports.recordAdaptationReplays) return;
  try {
    await input.ports.recordAdaptationReplays({ projectId: input.projectId, flowId: session.flowId, runId: session.runId, checkedAt: session.finishedAt ?? Date.now(), trace: session.trace, ...(input.subflowId !== undefined ? { subflowId: input.subflowId } : {}) });
  } catch {
    /* best-effort: replay evidence never fails the finished run it describes */
  }
}
