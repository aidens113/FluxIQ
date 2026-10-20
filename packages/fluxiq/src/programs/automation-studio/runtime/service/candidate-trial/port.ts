// The trial port the service injects into candidate authoring
// (`AutomationStudioCandidateTrialPort`, pinned by U1): one per build, bound to
// the candidate id Core minted before the loop, keeping a record of every
// trial it ran for the promotion's audit and the build's accounting.
//
// **A trial its judge did not judge is judged again (t473).** The port keeps
// the evidence of the last trial of each revision and digest that came back
// `not_judged` from its judge (`./run.ts`), and a request to test that same
// revision asks the judge again on it, once per request, instead of running
// the identical Flow again. A verdict, or a new trial, drops it.
//
// **The start hook runs before the reset check (t475).** With a start hook
// the port offers `prepareStart`, which the trial gate calls before the
// build's reset check: the hook puts the site back, the check then confirms a
// clean start with no model call, and the trial of that revision and digest
// runs on the start the hook made, without running it again. Lane D round 10
// (`run-mv5tusge-1400ddf7`) spent eight model calls undoing what the hook then
// put back anyway. A re-judgement runs nothing, so it prepares nothing.
//
// **The port says the kind of environment its trials run in (traces and
// offline trials, U7).** `environmentKind` is `ports.environment`'s kind, live
// when absent, for the trial gate to read; and the port offers `prepareStart`
// only to a live trial, since an offline one runs no start hook (Decision 6).

import type { AutomationStudioCandidateTrialPort, AutomationStudioCandidateTrialResult } from "../../flow-bootstrap/candidate/index.ts";
import type { AutomationStudioCandidateTrialPorts, AutomationStudioCandidateTrialRecord, AutomationStudioCandidateTrialStart, AutomationStudioCandidateTrialUnjudged } from "./contracts.ts";
import { automationStudioTrialJudgingShortfall, automationStudioTrialLargestJudgePrompt } from "./judging-fits.ts";
import { automationStudioCandidateTrialStart, rejudgeAutomationStudioCandidateTrial, runAutomationStudioCandidateTrial } from "./run.ts";

/** The port, the trials it ran, and what their judges spent. */
export function automationStudioCandidateTrialPort(candidateId: string, ports: AutomationStudioCandidateTrialPorts): {
  port: AutomationStudioCandidateTrialPort;
  records(): AutomationStudioCandidateTrialRecord[];
  spent(): AutomationStudioCandidateTrialRecord["judge"];
} {
  const records: AutomationStudioCandidateTrialRecord[] = [];
  /** The evidence of the last trial of each revision and digest its judge did not judge (header). */
  const unjudged = new Map<string, AutomationStudioCandidateTrialUnjudged>();
  /** The start the hook made ahead of the reset check, for the next trial of that revision and digest only (header). */
  let ready: { key: string; start: AutomationStudioCandidateTrialStart } | undefined;
  const run = async (request: Parameters<AutomationStudioCandidateTrialPort>[0]): Promise<AutomationStudioCandidateTrialResult> => {
    // A request for another candidate, or whose frozen bytes are not the revision and digest it names, runs nothing.
    if (request.candidateId !== candidateId || request.candidate.revision !== request.revision || request.candidate.digest !== request.digest) {
      const refused: AutomationStudioCandidateTrialResult = { revision: request.revision, digest: request.digest, verdict: "execution_failed", feedback: { code: "candidate.trial_identity_mismatch" } };
      return refused;
    }
    const key = `${request.revision}:${request.digest}`, kept = unjudged.get(key);
    unjudged.delete(key);
    const start = ready?.key === key ? ready.start : undefined;
    ready = undefined;
    // The judge calls are held at the largest prompt an earlier trial's judge was sent (`./judging-fits.ts`, t661).
    const prompt = automationStudioTrialLargestJudgePrompt(records);
    const trial = kept ? await rejudgeAutomationStudioCandidateTrial(request, kept, ports, prompt) : await runAutomationStudioCandidateTrial(request, ports, start, prompt);
    if (trial.unjudged) unjudged.set(key, trial.unjudged);
    records.push(structuredClone(trial.record));
    return trial.result;
  };
  const environmentKind = ports.environment?.kind ?? "live";
  const port: AutomationStudioCandidateTrialPort = Object.assign(run, { environmentKind });
  // An offline trial runs no start hook, so only a live port offers one (header, Decision 6).
  if (ports.prepareStart && environmentKind === "live") {
    port.prepareStart = async ({ revision, digest, signal }) => {
      const key = `${revision}:${digest}`;
      ready = undefined;
      // A re-judgement runs nothing, so nothing is put back for it.
      if (unjudged.has(key)) return "none";
      // A trial the purse cannot judge does not start, so the site is not put back for it (`./judging-fits.ts`, t661).
      if (automationStudioTrialJudgingShortfall({ code: "candidate.trial_unaffordable", judgeInputTokens: automationStudioTrialLargestJudgePrompt(records) })) return "none";
      const start = await automationStudioCandidateTrialStart({ candidateId, revision, digest, signal }, ports);
      ready = { key, start };
      return start.status === "reset" ? "reset" : start.status === "failed" ? "failed" : "none";
    };
  }
  return {
    port,
    records: () => structuredClone(records),
    spent: () => records.reduce((total, record) => ({
      calls: total.calls + record.judge.calls, inputTokens: total.inputTokens + record.judge.inputTokens, outputTokens: total.outputTokens + record.judge.outputTokens,
      totalTokens: total.totalTokens + record.judge.totalTokens, estimatedCostUsd: total.estimatedCostUsd + record.judge.estimatedCostUsd
    }), { calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 })
  };
}
