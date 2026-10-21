// One offline trial of a submitted candidate (traces and offline trials, P4):
// the candidate trial runner, unchanged, with its environment a recorded trace.
//
// 1. The phase. Offline trials stay out of exploration (Decision 2): asked
//    there, nothing runs and the answer is `offline_not_allowed_in_phase`.
// 2. The source. The trace must be a live episode's: a derived trace (an
//    earlier offline trial's own capture, or one re-ingested) holds no live
//    evidence and is refused with `source_not_live`. Its clock origin is where
//    the trial's virtual clock starts.
// 3. The environment. A `trace` environment on that virtual clock
//    (`createAutomationStudioScopedRunEnvironment`): its own channel scope,
//    whose only client is a trace matcher session over the trace
//    (`ClientGatewayTraceMatcher`, P4b) attached to the trial's own gateway with
//    the session view the trace recorded, else the one the caller supplied
//    (declared as a normalization; never over a recorded one). A trace the
//    matcher refuses (incomplete, another contract, sessions it cannot tell
//    apart; a legacy trace whose one session it cannot attribute), or one with
//    no session view from either, is refused here, before anything runs or
//    any judge is paid. What the trace delivered before its first operation is
//    fed first, in recorded order.
// 4. The run. `runAutomationStudioCandidateTrial` with `ports.environment` set
//    to that environment and its clock: the same code path as a live trial.
//    Every command the executor, the host runtime and the evidence tools send
//    reaches the matcher through the gateway, and every answer comes back
//    through the gateway's real intake. The runner itself runs no start hook
//    and no site reset for a non-live environment (Decision 6); the judge is
//    asked about the new run's evidence (no model answer is ever replayed,
//    T22); and the trial's episode records a derived trace naming this source
//    (T24, `AutomationStudioGatewayTraceReplaySources`).
// 5. The end. The matcher's session is detached however the run ended, and the
//    answer is the runner's outcome beside the trial evidence result
//    (`./evidence-result.ts`), validated against U5.
//
// A cancelled build is not a verdict: the abort the runner throws goes on.

import { ClientGatewayTraceMatcher, type ClientGatewayTraceMatcherClock } from "../../../../../client-gateway/index.ts";
import { AutomationStudioVirtualClock, createAutomationStudioScopedRunEnvironment } from "../../environment/index.ts";
import { AutomationStudioGatewayTraceReplaySources } from "../../gateway-trace/index.ts";
import { runAutomationStudioCandidateTrial, type AutomationStudioCandidateTrialOutcome } from "../candidate-trial/index.ts";
import type { AutomationStudioOfflineCandidateTrialInput, AutomationStudioOfflineCandidateTrialOutcome, AutomationStudioOfflineCandidateTrialRefusal, AutomationStudioOfflineTrialNormalization } from "./contracts.ts";
import { automationStudioOfflineTrialEvidenceResult } from "./evidence-result.ts";
import { AUTOMATION_STUDIO_OFFLINE_TRIAL_READER_CONTRACTS } from "./reader-contracts.ts";

/** Why the matcher's session is closed when the trial is over. */
const DETACHED = "offline_trial.ended";

/** The goal contract a candidate with no original instructions digest is bound to, as the trial runner binds it (`../candidate-trial/run.ts`). */
const UNBOUND_GOAL = "candidate.requirements.unbound";

/** What a supplied session view is declared as: it came from the caller, not the trace. */
const SUPPLIED_VIEW: AutomationStudioOfflineTrialNormalization = Object.freeze({
  field: "session view",
  reason: "the trace recorded no session.claimed view, so the matcher's session was attached with the view the caller supplied (the live session's public view for the same client); it decides which session the trial's commands go to, and every command and answer is still matched against the trace"
});

export async function runAutomationStudioOfflineCandidateTrial(input: AutomationStudioOfflineCandidateTrialInput): Promise<AutomationStudioOfflineCandidateTrialOutcome> {
  const { request, ports, source, gateway } = input;
  request.signal.throwIfAborted();
  if (input.phase === "exploration") return refused("offline_not_allowed_in_phase", "an offline trial never runs during exploration; exploration acts on the live site");
  const manifest = await source.store.readManifest(source.traceId);
  if (manifest === undefined) return refused("incomplete_capture", "the store holds no manifest for the source trace");
  if (manifest.origin.kind !== "live") return refused("source_not_live", `the source trace is derived (${manifest.origin.derivation}): it holds no live episode's capture to run on`);
  const clock = new AutomationStudioVirtualClock(manifest.clockOrigin.epochMs);
  // `random` fixed at its midpoint, which the Wait node reads as no jitter, so the trial is reproducible.
  const environment = createAutomationStudioScopedRunEnvironment({ kind: "trace", clock, random: () => 0.5 });
  const advance: ClientGatewayTraceMatcherClock = { advance: async (ms) => clock.advance(ms) };
  const matcher = await ClientGatewayTraceMatcher.load({
    store: source.store,
    traceId: source.traceId,
    gateway,
    clock: advance,
    contractVersions: input.contractVersions ?? AUTOMATION_STUDIO_OFFLINE_TRIAL_READER_CONTRACTS,
    ...(source.sessionRef === undefined ? {} : { sessionRef: source.sessionRef })
  });
  const refusal = matcher.report().refusal;
  if (refusal !== null) return refused(refusal.reason, refusal.detail);
  const view = matcher.sessionView(input.sessionView);
  if (view === null) return refused("incomplete_capture", "the source trace recorded no session view (no session.claimed event) and the caller supplied none: there is no client for the trial's commands to reach");
  const session = matcher.attach(environment.scopeId, input.sessionView);
  let trial: AutomationStudioCandidateTrialOutcome;
  try {
    await matcher.deliverOpening();
    trial = await AutomationStudioGatewayTraceReplaySources.run([source.traceId], () => runAutomationStudioCandidateTrial(request, { ...ports, environment, now: environment.now }));
    await matcher.settled();
  } finally {
    gateway.disconnect(session.sessionId, DETACHED);
  }
  const report = matcher.report();
  const evidence = automationStudioOfflineTrialEvidenceResult({
    trial,
    matcher: report,
    sourceEpisodeId: manifest.episodeId,
    goalContractVersion: input.goalContractVersion ?? request.candidate.originalInstructionsDigest ?? UNBOUND_GOAL
  });
  return {
    status: "ran",
    trial,
    evidence,
    matcher: report,
    sessionView: view.source,
    normalizations: view.source === "supplied" ? [{ ...SUPPLIED_VIEW }] : [],
    supported: { matchedOperations: report.matchedOperations.length, recordedOperations: report.recordedOperations }
  };
}

function refused(reasonCode: AutomationStudioOfflineCandidateTrialRefusal["reasonCode"], detail: string): AutomationStudioOfflineCandidateTrialRefusal {
  return { status: "refused", reasonCode, detail };
}
