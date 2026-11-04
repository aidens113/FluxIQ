// One offline trial of a candidate against one exploration's recording, by page position
// and acts done (Answer First, the Simulation): the candidate trial runner, unchanged, with
// its environment that recording, and the state engine in the matcher's place. Everything
// else is the offline trial's own session (`../matcher-session.ts`): the phase, a live
// source, the trace environment on a virtual clock, the session view, the replay scope, and
// the detach however the run ended. The old matcher is untouched and stays for what uses it.
//
// The answer is pure: no judge decides it. The caller's `ports.judge` is asked, as the
// runner asks it, and the result does not read its verdict; hand it one that calls no model
// (`AutomationStudioOfflineCandidateTrialInput["ports"]`). Wired into no live path.

import { ClientGatewayTraceStateEngine, type ClientGatewayTraceMatcherSessionView, type ClientGatewayTraceStateDomain, type ClientGatewayTraceStateEngineReport, type ClientGatewayTraceStateRecordedCall, type ClientGatewayTraceStateReceipt } from "../../../../../client-gateway/index.ts";
import type { AutomationStudioTrialEvidenceResult } from "../../../../../flows/authoring/model/index.ts";
import { automationStudioTrialExecutedSteps, runAutomationStudioCandidateTrial, type AutomationStudioCandidateTrialOutcome } from "../../candidate-trial/index.ts";
import type { AutomationStudioGraphExecutionTrace } from "../../../executor/index.ts";
import { runAutomationStudioDetachedCandidate } from "../../../../../runtime/flow-authoring/bootstrap/verification/index.ts";
import type { AutomationStudioOfflineCandidateTrialInput, AutomationStudioOfflineTrialNormalization, AutomationStudioOfflineTrialRefusal } from "../contracts.ts";
import { automationStudioOfflineTrialTraceSession } from "../matcher-session.ts";
import { automationStudioStateTrialEvidenceResult, type AutomationStudioStateTrialReference } from "./evidence-result.ts";
import { automationStudioStateTrialStepGaps, type AutomationStudioOfflineStateTrialStepGap } from "./step-gaps.ts";

/** The goal contract a candidate with no original instructions digest is bound to, as the trial runner binds it (`../../candidate-trial/run.ts`). */
const UNBOUND_GOAL = "candidate.requirements.unbound";

export type AutomationStudioOfflineStateTrialInput = Omit<AutomationStudioOfflineCandidateTrialInput, "reevaluator"> & {
  /** The domain's half of the rule. */
  domain: ClientGatewayTraceStateDomain;
  /** Whether the recording's own result had a live yes. Without one the result is `inconclusive`: fitting it shows nothing. */
  reference: AutomationStudioStateTrialReference;
  /** Whether the recording ends at the trace's first trial, as a saved build's exploration needs. */
  upToFirstChild?: boolean | undefined;
  /** Receipts for recorded acts, by a call's ordinal among the calls the recording holds. */
  receipts?: ((calls: readonly ClientGatewayTraceStateRecordedCall[]) => ReadonlyMap<number, ClientGatewayTraceStateReceipt>) | undefined;
};

export type AutomationStudioOfflineStateTrialRan = {
  status: "ran";
  /** Every gap of the run, in order, each with its step. */
  stepGaps: AutomationStudioOfflineStateTrialStepGap[];
  trial: AutomationStudioCandidateTrialOutcome;
  evidence: AutomationStudioTrialEvidenceResult;
  engine: ClientGatewayTraceStateEngineReport;
  sessionView: ClientGatewayTraceMatcherSessionView["source"];
  normalizations: AutomationStudioOfflineTrialNormalization[];
};

export type AutomationStudioOfflineStateTrialOutcome = AutomationStudioOfflineTrialRefusal | AutomationStudioOfflineStateTrialRan;

export async function runAutomationStudioOfflineStateTrial(input: AutomationStudioOfflineStateTrialInput): Promise<AutomationStudioOfflineStateTrialOutcome> {
  const { request, ports, source, gateway, domain } = input;
  request.signal.throwIfAborted();
  let executed: AutomationStudioGraphExecutionTrace | undefined;
  const execute: typeof runAutomationStudioDetachedCandidate = async (run) => {
    const result = await (ports.execute ?? runAutomationStudioDetachedCandidate)(run);
    executed = result.trace;
    return result;
  };
  const session = await automationStudioOfflineTrialTraceSession(input, (clock, contractVersions) => ClientGatewayTraceStateEngine.load({
    store: source.store,
    traceId: source.traceId,
    gateway,
    clock,
    contractVersions,
    domain,
    ...(source.sessionRef === undefined ? {} : { sessionRef: source.sessionRef }),
    ...(input.upToFirstChild === undefined ? {} : { upToFirstChild: input.upToFirstChild }),
    ...(input.receipts === undefined ? {} : { receipts: input.receipts })
  }), (environment) => runAutomationStudioCandidateTrial(request, { ...ports, execute, environment, now: environment.now }));
  if (session.status === "refused") return session;
  const { trial, report: engine, sessionView, normalizations, sourceEpisodeId } = session;
  const evidence = automationStudioStateTrialEvidenceResult({
    trial,
    engine,
    sourceEpisodeId,
    reference: input.reference,
    goalContractVersion: input.goalContractVersion ?? request.candidate.originalInstructionsDigest ?? UNBOUND_GOAL
  });
  const declared = domain.normalisations.map((normalisation) => ({ field: normalisation.id, reason: normalisation.why }));
  const stepGaps = automationStudioStateTrialStepGaps({ steps: automationStudioTrialExecutedSteps(executed?.attempts ?? []), commands: engine.commandActions, gaps: engine.gaps });
  return { status: "ran", trial, evidence, engine, stepGaps, sessionView, normalizations: [...normalizations, ...declared] };
}
