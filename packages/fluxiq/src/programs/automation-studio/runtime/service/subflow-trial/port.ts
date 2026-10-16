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

import type { AutomationStudioSubflowTrialPreparingPort } from "../../flow-bootstrap/subflow-candidate/index.ts";
import { automationStudioTrialJudgingShortfall, automationStudioTrialLargestJudgePrompt, type AutomationStudioCandidateTrialStart } from "../candidate-trial/index.ts";
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
  const port: AutomationStudioSubflowTrialPreparingPort = async (request) => {
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
    const trial = await runAutomationStudioSubflowTrial(request, ports, start, automationStudioTrialLargestJudgePrompt(records));
    records.push(structuredClone(trial.record));
    return trial.result;
  };
  if (ports.prepareStart) {
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
