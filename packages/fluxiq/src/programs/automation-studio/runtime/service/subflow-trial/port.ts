// The partial-trial port the service injects into each subflow builder
// (`AutomationStudioSubflowTrialPort`, `../../flow-bootstrap/subflow-candidate/`):
// one per build, bound to the build id Core minted, shared by every brief of
// that build and keeping a record of every partial trial for the build record
// and its accounting. Briefs may call it at the same time; each trial opens
// its own session and run id, and nothing here is shared between them but the
// record list and the starts prepared ahead, each kept under its own brief.
//
// **The start hook runs before the gate's reset check (t578, as t475 for a
// whole candidate).** With a start hook the port offers `prepareStart`, which
// the subflow trial gate calls before the brief's site-reset check: the hook
// puts the site back, the check then admits the trial with no model call, and
// the trial of that brief, revision and digest runs on the start the hook
// made, without running it again (`./run.ts`, `preparedStart`). A prepared
// start not followed by its trial is dropped by the next `prepareStart` of the
// same brief, revision and digest.
//
// **A trial the purse cannot judge puts nothing back (t661).** `prepareStart`
// runs no hook when the purse cannot hold the trial's two judge calls: the
// trial will not start (`./run.ts`).
//
// **A flagged yes is answered from the converse (t692).** Every judged trial's
// outcome says whether its yes was confirmed by the judge's converse question
// (`./run.ts`); the port keeps that by the trial's run id and answers the
// gate's `checkRows` with it, for this build's trials only. A trial it does
// not know is answered nothing, so its yes is not taken.
//
// **The port says the kind of environment its trials run in (U7)**, as a whole
// candidate's port does (`../candidate-trial/port.ts`): `environmentKind`, live
// when `ports.environment` is absent, and `prepareStart` only when live.
//
// **Each partial trial it runs is a traced episode, opened by the runner
// (traces and offline trials, P2 D9, P3 D1)**, as a whole candidate's is
// (`../candidate-trial/port.ts`): the runner opens it after the trial's start,
// around its own run (`./run.ts`), so the start hook -- prepared here or run
// by the runner -- and the site reset stay in the build's trace.
//
// **A repair is checked from its step (t804).** A live port offers
// `fromStep`: the proposal run from one of its steps on the page as it stands,
// with no hook, reset, arrival, predecessors or judge (`./from-step.ts`). It is
// not a trial, so it is not recorded with them, costs no judge spend and is
// never a run `checkRows` answers for. An offline port offers none, as it
// offers no `prepareStart`: a from-step run acts on the page as it stands, and
// an offline environment has no page left by a live test.

import type { AutomationStudioSubflowFromStepPort, AutomationStudioSubflowTrialPreparingPort, AutomationStudioSubflowTrialResult, AutomationStudioSubflowTrialRowCheck } from "../../flow-bootstrap/subflow-candidate/index.ts";
import { automationStudioTrialJudgingShortfall, automationStudioTrialLargestJudgePrompt, type AutomationStudioCandidateTrialStart } from "../candidate-trial/index.ts";
import { runAutomationStudioSubflowFromStep } from "./from-step.ts";
import { runAutomationStudioSubflowTrial } from "./run.ts";
import { automationStudioSubflowTrialStart } from "./start.ts";
import type { AutomationStudioSubflowTrialPorts, AutomationStudioSubflowTrialRecord } from "./types.ts";

/** The port, the partial trials it ran, and what their judges spent. */
export function automationStudioSubflowTrialPort(buildId: string, ports: AutomationStudioSubflowTrialPorts): {
  port: AutomationStudioSubflowTrialPreparingPort;
  records(): AutomationStudioSubflowTrialRecord[];
  spent(): AutomationStudioSubflowTrialRecord["judge"];
} {
  const records: AutomationStudioSubflowTrialRecord[] = [];
  /** The start the hook made ahead of the reset check, by brief, revision and digest, for that trial only (header). */
  const ready = new Map<string, AutomationStudioCandidateTrialStart>();
  /** Whether each judged trial's yes was confirmed by the converse question, by its run id (header, t692). */
  const converse = new Map<string, AutomationStudioSubflowTrialRowCheck>();
  const run = async (request: Parameters<AutomationStudioSubflowTrialPreparingPort>[0]): Promise<AutomationStudioSubflowTrialResult> => {
    // A request of another build runs nothing; the run refuses a proposal of another scope itself.
    if (request.scope.buildId !== buildId) {
      return {
        partial: true,
        scope: "subflow",
        identity: { buildId: request.scope.buildId, briefId: request.scope.briefId, planDigest: request.scope.planDigest, subflowKey: request.scope.subflowKey },
        revision: request.proposal.revision,
        digest: request.proposal.digest,
        verdict: "execution_failed",
        feedback: { code: "subflow.trial_other_build", partial: true, entryPrepared: false },
        entryPrepared: false
      };
    }
    const key = keyOf(request.scope.briefId, request.proposal.revision, request.proposal.digest);
    const start = ready.get(key);
    ready.delete(key);
    // The judge calls are held at the largest prompt an earlier partial trial's judge was sent (`../candidate-trial/judging-fits.ts`, t661).
    const prompt = automationStudioTrialLargestJudgePrompt(records);
    const trial = await runAutomationStudioSubflowTrial(request, ports, start, prompt);
    records.push(structuredClone(trial.record));
    if (trial.rowCheck && trial.result.trialRunId) converse.set(trial.result.trialRunId, { ...trial.rowCheck });
    return trial.result;
  };
  const environmentKind = ports.environment?.kind ?? "live";
  // A run from one step (header, t804): never a trial, so nothing of it is recorded here, spent or offered to `checkRows`.
  const fromStep: AutomationStudioSubflowFromStepPort = async (request) => {
    if (request.scope.buildId === buildId) return await runAutomationStudioSubflowFromStep(request, ports);
    const { scope, proposal, fromKey } = request;
    const code = "subflow.trial_other_build";
    return { fromStep: true, identity: { buildId: scope.buildId, briefId: scope.briefId, planDigest: scope.planDigest, subflowKey: scope.subflowKey }, revision: proposal.revision, digest: proposal.digest,
      fromKey, status: "not_run", passedKeys: [], code, feedback: { fromStep: true, from: fromKey, status: "not_run", passed: false, code } };
  };
  const port: AutomationStudioSubflowTrialPreparingPort = Object.assign(run, { environmentKind, ...(environmentKind === "live" ? { fromStep } : {}) });
  // The gate's row check, answered from the converse of this build's own trials (header, t692).
  port.checkRows = async ({ scope, trialRunId }) => (scope.buildId === buildId && trialRunId ? converse.get(trialRunId) : undefined);
  // An offline trial runs no start hook, so only a live port offers one (header, Decision 6).
  if (ports.prepareStart && environmentKind === "live") {
    port.prepareStart = async ({ scope, revision, digest, signal }) => {
      // Another build's trial is refused unrun, so nothing is put back for it.
      if (scope.buildId !== buildId) return "none";
      const key = keyOf(scope.briefId, revision, digest);
      ready.delete(key);
      // A trial the purse cannot judge does not start, so the site is not put back for it (t661).
      if (automationStudioTrialJudgingShortfall({ code: "subflow.trial_unaffordable", judgeInputTokens: automationStudioTrialLargestJudgePrompt(records) })) return "none";
      const start = await automationStudioSubflowTrialStart({ scope, revision, digest, signal }, ports);
      ready.set(key, start);
      return start.status === "reset" ? "reset" : start.status === "failed" ? "failed" : "none";
    };
  }
  return {
    port,
    records: () => structuredClone(records),
    spent: () => records.reduce((total, record) => ({
      calls: total.calls + record.judge.calls,
      inputTokens: total.inputTokens + record.judge.inputTokens,
      outputTokens: total.outputTokens + record.judge.outputTokens,
      totalTokens: total.totalTokens + record.judge.totalTokens,
      estimatedCostUsd: total.estimatedCostUsd + record.judge.estimatedCostUsd
    }), { calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 })
  };
}

function keyOf(briefId: string, revision: number, digest: string): string { return `${briefId}\n${revision}\n${digest}`; }
