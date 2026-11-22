// Every ending, the same way, a budget-out and a person's Stop among them (design, "The shape"):
// the last look at the site, the act record flushed so the first real run sees every act, the
// session ended and its rows processed and read back, the draft saved best-effort, the attempt
// and its result checked against each other, both stored, and then what the task keeps of it
// (`./remember.ts`). Last, with the result safe, a Flow a whole run proved goes into the person's Flow
// (`../apply-proven/`).
//
// **Nothing past the rounds may lose the result.** Each step here is either one that cannot
// throw or is held so a failure says so and goes on: the person's answer is what this returns.
// The one throw left is the contract's check of an ending that contradicts itself, which is a
// programming error (`automationStudioAnswerFirstEnding`).
//
// **A result a caller took unchecked** (`taken_unverified`: its judge `off` and no check of its own;
// `../completion/check.ts`) is the result: it is stored `achieved`, labelled `unverified` with why,
// on an attempt marked `checkingOff` (`./keep.ts`), which is the one attempt the shared contract
// lets be achieved unconfirmed. It is never stored as a person's Stop. The answer's
// `confirmedBy: "none"` says nothing confirmed it, by the caller's choice.

import { automationStudioAnswerFirstEnding } from "../../../../../runtime/answer-first/result/index.ts";
import { emitAutomationStudioAttemptEnded } from "../../../../../runtime/automation-activity/index.ts";
import type { AutomationStudioGenerateFlowBootstrapAdaptationAnswered } from "../../flow-bootstrap-commands/index.ts";
import { automationStudioAnswerFirstApplyProven } from "../apply-proven/index.ts";
import { automationStudioAnswerFirstReplayKept } from "../completion/index.ts";
import { automationStudioAnswerFirstStandIn } from "../flow-run/index.ts";
import { AUTOMATION_STUDIO_ANSWER_FIRST_CHECK_MISSING } from "../interrupted/index.ts";
import { automationStudioAnswerFirstTriedAsContract } from "../loop-signal/index.ts";
import { automationStudioAnswerFirstAccounting } from "./accounting.ts";
import { automationStudioAnswerFirstHeldStated, automationStudioAnswerFirstSaveDraft } from "./draft-save.ts";
import { automationStudioAnswerFirstAttemptAs, automationStudioAnswerFirstResultAs } from "./keep.ts";
import { automationStudioAnswerFirstPathAtEnding } from "./path.ts";
import { automationStudioAnswerFirstRemember } from "./remember.ts";
import type { AutomationStudioAnswerFirstRoundsEnding } from "./rounds.ts";
import { automationStudioAnswerFirstSay } from "./say.ts";
import type { AutomationStudioAnswerFirstAttemptRun } from "./state.ts";
import { automationStudioAnswerFirstTrailsOf } from "../trail/index.ts";

const BUDGET_MISSING = "The budget ran out before this was confirmed.";
const STOP_MISSING = "You stopped it before this was confirmed.";
const TAKEN_MISSING = "Nothing checked this result: checking was turned off for this task.";
const SESSION_END = { achieved: "succeeded", taken_unverified: "succeeded", budget_out: "failed", stopped_by_person: "cancelled", waiting_for_check: "failed" } as const;

export async function automationStudioAnswerFirstFinish(run: AutomationStudioAnswerFirstAttemptRun, ending: AutomationStudioAnswerFirstRoundsEnding): Promise<AutomationStudioGenerateFlowBootstrapAdaptationAnswered> {
  const { input } = run;
  // The step the saved Flow broke at leaves it where this attempt put its fix in the Flow, before the path reads the Flow and anything saves it (`../flow-run/stand-in.ts`).
  automationStudioAnswerFirstStandIn(run);
  run.path = automationStudioAnswerFirstPathAtEnding(run, ending);
  await run.witnesses.atEnd();
  const flushed = await flushedRecord(run);
  run.result.draft(run.steps);
  let withheld = true;
  if (run.result.readiness().state === "missing-evidence") {
    try { await run.sink.withhold(); }
    catch { withheld = false; } // Completion already refuses this state; a storage failure cannot add a terminal ending.
  }
  else await run.sink.publish(run.result.rows(), run.result.evidence());
  const sessionEnded = await endedSession(run, ending);
  // Read back for what it does to the store: the run's datasets are processed for the Data window and an export. The answer is the attempt's one result (`../result-feed/`), the draft's output step.
  await run.sink.readBack();
  run.result.draft(run.steps);
  const rows = run.result.rows();
  const summary = ending === "achieved" ? "What the attempt did, as a Flow." : "What the attempt had done when it ended, as a Flow.";
  const draft = await automationStudioAnswerFirstSaveDraft(run, summary);
  if (draft.kind === "kept") automationStudioAnswerFirstSay("The steps were not saved as a Flow", "I could not write what I did as a Flow this time, so I kept the steps with this attempt.");
  // A wait is for a check only a person can clear: a caught loop never parks (t885 fix 34), so no ending waits on one.
  const missing = ending === "achieved" ? undefined : ending === "budget_out" ? BUDGET_MISSING : ending === "stopped_by_person" ? STOP_MISSING : ending === "taken_unverified" ? TAKEN_MISSING : AUTOMATION_STUDIO_ANSWER_FIRST_CHECK_MISSING;
  const status = ending === "waiting_for_check" ? { status: "waiting_for_person" as const, waitingFor: "person_only_check" as const } : { status: ending === "taken_unverified" ? "achieved" as const : ending };
  const checked = automationStudioAnswerFirstEnding({ attempt: automationStudioAnswerFirstAttemptAs(run, status), result: automationStudioAnswerFirstResultAs(run, rows, missing) });
  const saved = await storedEnding(run, checked, draft.kind === "saved" ? draft.record.candidateId : undefined, draft.kind === "kept" ? draft.why : undefined);
  const candidateId = draft.kind === "saved" ? draft.record.candidateId : undefined;
  const remembered = await automationStudioAnswerFirstRemember(run, ending, { label: checked.result?.label ?? "unverified", candidateId, stated: draft.kind === "saved" ? draft.stated : automationStudioAnswerFirstHeldStated(run), spend: { calls: checked.attempt.spend.calls, usd: checked.attempt.spend.usd }, atMs: checked.attempt.endedAtMs ?? Date.now() });
  const applied = await automationStudioAnswerFirstApplyProven(run, ending, draft.kind === "saved" ? { record: draft.record } : {});
  if (!flushed.ok || !sessionEnded.ok || !saved.ok || !remembered.ok || !applied.ok || !withheld) automationStudioAnswerFirstSay("Part of the record was not written", "Part of the attempt's record could not be written down.");
  const answer: AutomationStudioGenerateFlowBootstrapAdaptationAnswered = {
    projectId: input.projectId,
    flowId: input.flowId,
    status: "answered",
    sourceInstructionIds: [...input.instructionIds],
    baseDependencyDigest: input.baseDependencyDigest,
    baseSettingsRevision: input.baseSettingsRevision,
    accounting: automationStudioAnswerFirstAccounting(run),
    attempt: checked.attempt,
    ...(checked.result ? { result: checked.result } : {}),
    ...(draft.kind === "saved" ? { candidateId: draft.record.candidateId, revision: draft.record.candidate.revision, digest: draft.record.candidate.digest } : {}),
    ...confirmedBy(run, ending)
  };
  // The answer is stored: the toast and the header close now, with the card, and not when the whole build returns.
  emitAutomationStudioAttemptEnded(answer);
  return answer;
}

/** What confirmed a result a caller's attempt took (header), and nothing on a chat attempt or one that ended without a result taken. */
function confirmedBy(run: AutomationStudioAnswerFirstAttemptRun, ending: AutomationStudioAnswerFirstRoundsEnding): Pick<AutomationStudioGenerateFlowBootstrapAdaptationAnswered, "confirmedBy"> {
  if (!run.input.caller) return {};
  if (ending === "taken_unverified") return { confirmedBy: "none" };
  const by = run.completion.state.confirmedBy;
  return ending === "achieved" && by ? { confirmedBy: by } : {};
}

async function flushedRecord(run: AutomationStudioAnswerFirstAttemptRun): Promise<{ ok: true } | { ok: false; errorName: string }> {
  try {
    await run.record.flushed();
    return { ok: true };
  } catch (error) {
    return { ok: false, errorName: error instanceof Error ? error.name : "unknown" };
  }
}

async function endedSession(run: AutomationStudioAnswerFirstAttemptRun, ending: AutomationStudioAnswerFirstRoundsEnding): Promise<{ ok: true } | { ok: false; errorName: string }> {
  try {
    await run.session.end(SESSION_END[ending]);
    return { ok: true };
  } catch (error) {
    return { ok: false, errorName: error instanceof Error ? error.name : "unknown" };
  }
}

async function storedEnding(run: AutomationStudioAnswerFirstAttemptRun, checked: ReturnType<typeof automationStudioAnswerFirstEnding>, candidateId: string | undefined, draftKept?: "not_assembled" | "not_saved"): Promise<{ ok: true } | { ok: false; errorName: string }> {
  try {
    const journal = automationStudioAnswerFirstTrailsOf(run.input.owner);
    const judgeEvidence = journal.checkpoint(run.trail, run.witnesses.readings(), { ...journal.capability(run.trail, run.input.binding), projectJudgeEvidence: run.input.binding?.projectJudgeEvidence, deniedEvidenceKeys: run.input.binding?.deniedEvidenceKeys });
    await run.store.save(run.input.projectId, run.input.flowId, {
      attempt: checked.attempt,
      ...(run.processingReferenceTimeMs === undefined ? {} : { processingReferenceTimeMs: run.processingReferenceTimeMs }),
      ...(run.result.processingDeclaration() === undefined ? {} : { processing: run.result.processingDeclaration()!, resultEvidence: run.result.evidence() }),
      ...(judgeEvidence === undefined ? {} : { judgeEvidence }),
      ...(checked.result ? { result: checked.result } : {}),
      tried: automationStudioAnswerFirstTriedAsContract(run.tried.data()),
      ...(candidateId === undefined ? {} : { candidateId }),
      ...(draftKept === undefined ? {} : { draftKept }),
      ...automationStudioAnswerFirstReplayKept(run.completion.state),
      // Always: they are what the next attempt seeds from, and what a carry-on goes on from.
      steps: run.steps
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, errorName: error instanceof Error ? error.name : "unknown" };
  }
}
