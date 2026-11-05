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

import { automationStudioAnswerFirstEnding } from "../../../../../runtime/answer-first/result/index.ts";
import type { AutomationStudioGenerateFlowBootstrapAdaptationAnswered } from "../../flow-bootstrap-commands/index.ts";
import { automationStudioAnswerFirstApplyProven } from "../apply-proven/index.ts";
import { AUTOMATION_STUDIO_ANSWER_FIRST_CHECK_MISSING, AUTOMATION_STUDIO_ANSWER_FIRST_STUCK_MISSING } from "../interrupted/index.ts";
import { automationStudioAnswerFirstTriedAsContract } from "../loop-signal/index.ts";
import { automationStudioAnswerFirstAccounting } from "./accounting.ts";
import { automationStudioAnswerFirstSaveDraft } from "./draft-save.ts";
import { automationStudioAnswerFirstAttemptAs, automationStudioAnswerFirstResultAs } from "./keep.ts";
import { automationStudioAnswerFirstPathAtEnding } from "./path.ts";
import { automationStudioAnswerFirstRemember } from "./remember.ts";
import type { AutomationStudioAnswerFirstRoundsEnding } from "./rounds.ts";
import { automationStudioAnswerFirstSay } from "./say.ts";
import type { AutomationStudioAnswerFirstAttemptRun } from "./state.ts";

const BUDGET_MISSING = "The budget ran out before this was confirmed.";
const STOP_MISSING = "You stopped it before this was confirmed.";
const SESSION_END = { achieved: "succeeded", budget_out: "failed", stopped_by_person: "cancelled", waiting_for_check: "failed" } as const;

export async function automationStudioAnswerFirstFinish(run: AutomationStudioAnswerFirstAttemptRun, ending: AutomationStudioAnswerFirstRoundsEnding): Promise<AutomationStudioGenerateFlowBootstrapAdaptationAnswered> {
  const { input } = run;
  run.path = automationStudioAnswerFirstPathAtEnding(run, ending);
  await run.witnesses.atEnd();
  const flushed = await flushedRecord(run);
  const sessionEnded = await endedSession(run, ending);
  const rows = await run.sink.readBack();
  const summary = ending === "achieved" ? "What the attempt did, as a Flow." : "What the attempt had done when it ended, as a Flow.";
  const draft = await automationStudioAnswerFirstSaveDraft(run, summary);
  if (draft.kind === "kept") automationStudioAnswerFirstSay("The steps were not saved as a Flow", "I could not write what I did as a Flow this time, so I kept the steps with this attempt.");
  // A wait is for a check only a person can clear, or for a person to say whether a task that kept getting stuck goes on.
  const stuck = ending === "waiting_for_check" && run.waitingFor === "stuck_in_a_loop";
  const missing = ending === "achieved" ? undefined : ending === "budget_out" ? BUDGET_MISSING : ending === "stopped_by_person" ? STOP_MISSING : stuck ? AUTOMATION_STUDIO_ANSWER_FIRST_STUCK_MISSING : AUTOMATION_STUDIO_ANSWER_FIRST_CHECK_MISSING;
  const status = ending === "waiting_for_check" ? { status: "waiting_for_person" as const, waitingFor: stuck ? "stuck_in_a_loop" as const : "person_only_check" as const } : { status: ending };
  const checked = automationStudioAnswerFirstEnding({ attempt: automationStudioAnswerFirstAttemptAs(run, status), result: automationStudioAnswerFirstResultAs(run, rows, missing) });
  const saved = await storedEnding(run, checked, draft.kind === "saved" ? draft.record.candidateId : undefined);
  const candidateId = draft.kind === "saved" ? draft.record.candidateId : undefined;
  const remembered = await automationStudioAnswerFirstRemember(run, ending, { label: checked.result?.label ?? "unverified", candidateId, spend: { calls: checked.attempt.spend.calls, usd: checked.attempt.spend.usd }, atMs: checked.attempt.endedAtMs ?? Date.now() });
  const applied = await automationStudioAnswerFirstApplyProven(run, ending, draft.kind === "saved" ? { record: draft.record } : {});
  if (!flushed.ok || !sessionEnded.ok || !saved.ok || !remembered.ok || !applied.ok) automationStudioAnswerFirstSay("Part of the record was not written", "I have the result, but part of what goes with it could not be written down.");
  return {
    projectId: input.projectId,
    flowId: input.flowId,
    status: "answered",
    sourceInstructionIds: [...input.instructionIds],
    baseDependencyDigest: input.baseDependencyDigest,
    baseSettingsRevision: input.baseSettingsRevision,
    accounting: automationStudioAnswerFirstAccounting(run),
    attempt: checked.attempt,
    ...(checked.result ? { result: checked.result } : {}),
    ...(draft.kind === "saved" ? { candidateId: draft.record.candidateId, revision: draft.record.candidate.revision, digest: draft.record.candidate.digest } : {})
  };
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

async function storedEnding(run: AutomationStudioAnswerFirstAttemptRun, checked: ReturnType<typeof automationStudioAnswerFirstEnding>, candidateId: string | undefined): Promise<{ ok: true } | { ok: false; errorName: string }> {
  try {
    await run.store.save(run.input.projectId, run.input.flowId, {
      attempt: checked.attempt,
      ...(checked.result ? { result: checked.result } : {}),
      tried: automationStudioAnswerFirstTriedAsContract(run.tried.data()),
      ...(candidateId === undefined ? {} : { candidateId }),
      // Always: they are what the next attempt seeds from, and what a carry-on goes on from.
      steps: run.steps
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, errorName: error instanceof Error ? error.name : "unknown" };
  }
}
