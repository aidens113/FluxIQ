// The matcher session an offline trial runs in (traces and offline trials, P4;
// shared by the whole-candidate runner `./run.ts` and the subflow runner
// `./subflow-run.ts`, t769 P6): everything about the recorded trace, so each
// runner adds only the trial runner it wraps and the goal contract its
// evidence result is bound to.
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
//    (declared as a normalization; never over a recorded one), with the
//    caller's reevaluator, if any (P5: a changed command that keeps the
//    recorded action type may be answered from what the trace recorded). A trace the
//    matcher refuses (incomplete, another contract, sessions it cannot tell
//    apart; a legacy trace whose one session it cannot attribute), or one with
//    no session view from either, is refused here, before anything runs or
//    any judge is paid. What the trace delivered before its first operation is
//    fed first, in recorded order.
// 4. The run. The caller's trial runner, handed that environment, runs inside
//    the replay-sources scope naming this trace, so the trial's own episode
//    records a derived trace naming its source (T24,
//    `AutomationStudioGatewayTraceReplaySources`); the session waits for the
//    matcher to settle.
// 5. The end. The matcher's session is detached however the run ended, and the
//    answer is the runner's outcome beside the matcher's report, the session
//    view's source, the normalizations, how many recorded operations matched,
//    the operations a reevaluator answered (ordinal, action type, differing
//    fields; no value), and the source episode the evidence result names.
//
// A cancelled build is not a verdict: whatever the runner throws goes on.

import { ClientGatewayTraceMatcher, type ClientGatewayClientHello, type ClientGatewaySession, type ClientGatewayTraceMatcherClock, type ClientGatewayTraceMatcherGapReason, type ClientGatewayTraceMatcherSessionView } from "../../../../client-gateway/index.ts";
import { AutomationStudioVirtualClock, createAutomationStudioScopedRunEnvironment, type AutomationStudioRunEnvironment } from "../../environment/index.ts";
import { AutomationStudioGatewayTraceReplaySources } from "../../../../runtime/recording/gateway-trace/index.ts";
import type { AutomationStudioOfflineTrialNormalization, AutomationStudioOfflineTrialRan, AutomationStudioOfflineTrialRefusal, AutomationStudioOfflineTrialRunOutcome, AutomationStudioOfflineTrialSessionInput } from "./contracts.ts";
import { AUTOMATION_STUDIO_OFFLINE_TRIAL_READER_CONTRACTS } from "./reader-contracts.ts";

/** Why the matcher's session is closed when the trial is over. */
const DETACHED = "offline_trial.ended";

/** What a supplied session view is declared as: it came from the caller, not the trace. */
const SUPPLIED_VIEW: AutomationStudioOfflineTrialNormalization = Object.freeze({
  field: "session view",
  reason: "the trace recorded no session.claimed view, so the matcher's session was attached with the view the caller supplied (the live session's public view for the same client); it decides which session the trial's commands go to, and every command and answer is still matched against the trace"
});

/** A session that ran: everything an offline trial answers but its evidence result, and the live episode the trace recorded, which that result names. */
type SessionRan<Trial extends AutomationStudioOfflineTrialRunOutcome> = Omit<AutomationStudioOfflineTrialRan<Trial>, "evidence"> & { sourceEpisodeId: string };

/** What stands in for the client over a recorded trace: the matcher, or the state engine (`./state/run.ts`). */
export type AutomationStudioOfflineTrialTraceClient<Report> = {
  report(): Report & { refusal: { reason: ClientGatewayTraceMatcherGapReason; detail: string } | null };
  sessionView(supplied?: ClientGatewayClientHello): ClientGatewayTraceMatcherSessionView | null;
  attach(scopeId: string, supplied?: ClientGatewayClientHello): ClientGatewaySession;
  deliverOpening(): Promise<void>;
  settled(): Promise<void>;
};

/** Steps 1 to 5 of the header around any client of a recorded trace: refused before anything runs, or the run, its session view and the client's report. */
export async function automationStudioOfflineTrialTraceSession<Trial, Report>(
  input: Pick<AutomationStudioOfflineTrialSessionInput, "source" | "gateway" | "phase" | "contractVersions" | "sessionView">,
  load: (clock: ClientGatewayTraceMatcherClock, contractVersions: Readonly<Record<string, string>>) => Promise<AutomationStudioOfflineTrialTraceClient<Report>>,
  run: (environment: AutomationStudioRunEnvironment) => Promise<Trial>
): Promise<AutomationStudioOfflineTrialRefusal | { status: "ran"; trial: Trial; report: Report; sessionView: ClientGatewayTraceMatcherSessionView["source"]; normalizations: AutomationStudioOfflineTrialNormalization[]; sourceEpisodeId: string }> {
  const { source, gateway } = input;
  if (input.phase === "exploration") return refused("offline_not_allowed_in_phase", "an offline trial never runs during exploration; exploration acts on the live site");
  const manifest = await source.store.readManifest(source.traceId);
  if (manifest === undefined) return refused("incomplete_capture", "the store holds no manifest for the source trace");
  if (manifest.origin.kind !== "live") return refused("source_not_live", `the source trace is derived (${manifest.origin.derivation}): it holds no live episode's capture to run on`);
  const clock = new AutomationStudioVirtualClock(manifest.clockOrigin.epochMs);
  // `random` fixed at its midpoint, which the Wait node reads as no jitter, so the trial is reproducible.
  const environment = createAutomationStudioScopedRunEnvironment({ kind: "trace", clock, random: () => 0.5 });
  const advance: ClientGatewayTraceMatcherClock = { advance: async (ms) => clock.advance(ms) };
  const matcher = await load(advance, input.contractVersions ?? AUTOMATION_STUDIO_OFFLINE_TRIAL_READER_CONTRACTS);
  const refusal = matcher.report().refusal;
  if (refusal !== null) return refused(refusal.reason, refusal.detail);
  const view = matcher.sessionView(input.sessionView);
  if (view === null) return refused("incomplete_capture", "the source trace recorded no session view (no session.claimed event) and the caller supplied none: there is no client for the trial's commands to reach");
  const session = matcher.attach(environment.scopeId, input.sessionView);
  let trial: Trial;
  try {
    await matcher.deliverOpening();
    trial = await AutomationStudioGatewayTraceReplaySources.run([source.traceId], () => run(environment));
    await matcher.settled();
  } finally {
    gateway.disconnect(session.sessionId, DETACHED);
  }
  return {
    status: "ran",
    trial,
    report: matcher.report(),
    sessionView: view.source,
    normalizations: view.source === "supplied" ? [{ ...SUPPLIED_VIEW }] : [],
    sourceEpisodeId: manifest.episodeId
  };
}

/** Runs `run` in a trace environment whose only client is a matcher session over `input.source` (header), or says why it was refused. */
export async function automationStudioOfflineTrialMatcherSession<Trial extends AutomationStudioOfflineTrialRunOutcome>(
  input: AutomationStudioOfflineTrialSessionInput,
  run: (environment: AutomationStudioRunEnvironment) => Promise<Trial>
): Promise<AutomationStudioOfflineTrialRefusal | SessionRan<Trial>> {
  const { source, gateway } = input;
  const session = await automationStudioOfflineTrialTraceSession(input, (clock, contractVersions) => ClientGatewayTraceMatcher.load({
    store: source.store,
    traceId: source.traceId,
    gateway,
    clock,
    contractVersions,
    ...(source.sessionRef === undefined ? {} : { sessionRef: source.sessionRef }),
    ...(input.reevaluator === undefined ? {} : { reevaluator: input.reevaluator })
  }), run);
  if (session.status === "refused") return session;
  const { report, ...ran } = session;
  return {
    ...ran,
    matcher: report,
    supported: { matchedOperations: report.matchedOperations.length, recordedOperations: report.recordedOperations },
    reevaluated: report.matchedOperations
      .filter((operation) => operation.answeredFrom === "reevaluated")
      .map((operation) => ({ ordinal: operation.ordinal, actionType: operation.actionType, fields: [...operation.fields] }))
  };
}

function refused(reasonCode: AutomationStudioOfflineTrialRefusal["reasonCode"], detail: string): AutomationStudioOfflineTrialRefusal {
  return { status: "refused", reasonCode, detail };
}
