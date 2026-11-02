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
//
// **Each trial it runs is a traced episode, opened by the runner (traces and
// offline trials, P2 D9, P3 D1).** The runner opens the trial's episode after
// its start, around its own run (`./run.ts`), so the start hook -- whether
// `prepareStart` ran it ahead of the reset check or the runner did -- and the
// site reset stay in the build's trace. A re-judgement runs nothing on the
// site and opens no episode.

import type { AutomationStudioCandidateTrialPort, AutomationStudioCandidateTrialResult } from "../../flow-bootstrap/candidate/index.ts";
import type { AutomationStudioCandidateTrialPorts, AutomationStudioCandidateTrialRecord, AutomationStudioCandidateTrialUnjudged } from "./contracts.ts";
import { automationStudioTrialJudgingShortfall, automationStudioTrialLargestJudgePrompt } from "./judging-fits.ts";
import { automationStudioCandidateTrialStart, rejudgeAutomationStudioCandidateTrial, runAutomationStudioCandidateTrial } from "./run.ts";
import { AutomationStudioCandidateTrialModeOwner, bindCandidateTrialReadOnly } from "../../candidate-trials/mode/index.ts";
import { inheritCandidateTrialInvocation, bindCandidateTrialFrame } from "../../candidate-trials/authority/index.ts";
import { inheritTrialExecutionSource, trialExecutionSource, inheritTrialExecutionObservation, recordTrialOfflineSource } from "../../candidate-trials/observation/index.ts";

/** The port, the trials it ran, and what their judges spent. */
export function automationStudioCandidateTrialPort(candidateId: string, ports: AutomationStudioCandidateTrialPorts): {
  port: AutomationStudioCandidateTrialPort;
  records(): AutomationStudioCandidateTrialRecord[];
  spent(): AutomationStudioCandidateTrialRecord["judge"];
} {
  const records: AutomationStudioCandidateTrialRecord[] = [];
  /** The evidence of the last trial of each revision and digest its judge did not judge (header). */
  const unjudged = new Map<string, AutomationStudioCandidateTrialUnjudged>();
  const perform = async (request: Parameters<AutomationStudioCandidateTrialPort>[0], only?: "cached"): Promise<AutomationStudioCandidateTrialResult> => {
    // A request for another candidate, or whose frozen bytes are not the revision and digest it names, runs nothing.
    if (request.candidateId !== candidateId || request.candidate.revision !== request.revision || request.candidate.digest !== request.digest) {
      const refused: AutomationStudioCandidateTrialResult = { revision: request.revision, digest: request.digest, verdict: "execution_failed", feedback: { code: "candidate.trial_identity_mismatch" } };
      return refused;
    }
    const { state, automatic } = modeOwner.run(request);
    try {
      if (only === "cached" && (state.snapshot.mode !== "cached_rejudge" || !state.retained)) throw new Error("candidate.trial_cached_checkout_lost");
      const prompt = automationStudioTrialLargestJudgePrompt(records);
      const trial = state.retained ? await rejudgeAutomationStudioCandidateTrial(request, state.retained, ports, prompt)
        : await runAutomationStudioCandidateTrial(request, ports, state.prepared, prompt);
      if (trial.unjudged) modeOwner.keep(state.checkout, trial.unjudged);
      records.push(structuredClone(trial.record));
      recordTrialOfflineSource(ports, trial.record);
      return trial.result;
    } finally { if (automatic) modeOwner.release(state.checkout); }
  };
  const run: AutomationStudioCandidateTrialPort = request => perform(request);
  const environmentKind = ports.environment?.kind ?? "live";
  const port: AutomationStudioCandidateTrialPort = Object.assign(run, { environmentKind });
  bindCandidateTrialFrame(port);
  const modeOwner = new AutomationStudioCandidateTrialModeOwner({ port, candidateId, environment: ports.environment, environmentNow: () => ports.environment, offlineTarget: ports, unjudged });
  trialExecutionSource(ports)?.bind(modeOwner);
  inheritTrialExecutionSource(ports, port);
  inheritTrialExecutionObservation(ports, port);
  bindCandidateTrialReadOnly(port, request => perform(request, "cached"));
  // An offline trial runs no start hook, so only a live port offers one (header, Decision 6).
  if (ports.prepareStart && environmentKind === "live") {
    port.prepareStart = async (input) => {
      const { revision, digest, signal } = input;
      const key = `${revision}:${digest}`;
      modeOwner.clearLegacyReady();
      const checkout = modeOwner.start(input);
      // A re-judgement runs nothing, so nothing is put back for it.
      if (checkout ? checkout.snapshot.mode !== "live" : unjudged.has(key)) return "none";
      // A trial the purse cannot judge does not start, so the site is not put back for it (`./judging-fits.ts`, t661).
      if (automationStudioTrialJudgingShortfall({ code: "candidate.trial_unaffordable", judgeInputTokens: automationStudioTrialLargestJudgePrompt(records) })) return "none";
      const request = { candidateId, revision, digest, signal };
      inheritCandidateTrialInvocation(input, request);
      const start = await automationStudioCandidateTrialStart(request, ports);
      if (checkout) checkout.prepared = start;
      else modeOwner.setLegacyReady(key, start);
      return start.status === "reset" ? "reset" : start.status === "failed" ? "failed" : "none";
    };
    bindCandidateTrialFrame(port.prepareStart);
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
