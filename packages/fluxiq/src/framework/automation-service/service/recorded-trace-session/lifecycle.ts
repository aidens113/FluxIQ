// Shared recorded client lifecycle; caller-specific phase and reevaluation policy stays with each entry.
import type { ClientGatewayTraceMatcherClock, ClientGatewayTraceMatcherSessionView } from "../../../../client-gateway/index.ts";
import { AutomationStudioVirtualClock, createAutomationStudioScopedRunEnvironment, type AutomationStudioRunEnvironment } from "../../environment/index.ts";
import { AutomationStudioGatewayTraceReplaySources } from "../../../../runtime/recording/gateway-trace/index.ts";
import { AUTOMATION_STUDIO_RECORDED_TRACE_READER_CONTRACTS, type AutomationStudioRecordedTraceClient, type AutomationStudioRecordedTraceSessionInput } from "./contracts.ts";
import type { AutomationStudioOfflineTrialNormalization, AutomationStudioOfflineTrialRefusal } from "../offline-trial/index.ts";

const SUPPLIED_VIEW: AutomationStudioOfflineTrialNormalization = Object.freeze({ field: "session view", reason: "the trace recorded no session.claimed view, so the matcher uses the caller-supplied public view; every command and answer is still matched against the trace" });

export async function automationStudioRecordedTraceLifecycle<Result, Report>(
  input: AutomationStudioRecordedTraceSessionInput,
  load: (clock: ClientGatewayTraceMatcherClock, contractVersions: Readonly<Record<string, string>>) => Promise<AutomationStudioRecordedTraceClient<Report>>,
  run: (environment: AutomationStudioRunEnvironment) => Promise<Result>
): Promise<AutomationStudioOfflineTrialRefusal | { status: "ran"; trial: Result; report: Report; sessionView: ClientGatewayTraceMatcherSessionView["source"]; normalizations: AutomationStudioOfflineTrialNormalization[]; sourceEpisodeId: string }> {
  const { source, gateway } = input;
  const manifest = await source.store.readManifest(source.traceId);
  if (manifest === undefined) return refused("incomplete_capture", "the store holds no manifest for the source trace");
  if (manifest.origin.kind !== "live") return refused("source_not_live", `the source trace is derived (${manifest.origin.derivation}): it holds no live episode's capture to run on`);
  const clock = new AutomationStudioVirtualClock(manifest.clockOrigin.epochMs);
  // `random` fixed at its midpoint, which the Wait node reads as no jitter, so the trial is reproducible.
  const environment = createAutomationStudioScopedRunEnvironment({ kind: "trace", clock, random: () => 0.5 });
  const advance: ClientGatewayTraceMatcherClock = { advance: async (ms) => clock.advance(ms) };
  const matcher = await load(advance, input.contractVersions ?? AUTOMATION_STUDIO_RECORDED_TRACE_READER_CONTRACTS);
  const refusal = matcher.report().refusal;
  if (refusal !== null) return refused(refusal.reason, refusal.detail);
  const view = matcher.sessionView(input.sessionView);
  if (view === null) return refused("incomplete_capture", "the source trace recorded no session view (no session.claimed event) and the caller supplied none: there is no client for the trial's commands to reach");
  const session = matcher.attach(environment.scopeId, input.sessionView);
  let trial: Result;
  try {
    await matcher.deliverOpening();
    trial = await AutomationStudioGatewayTraceReplaySources.run([source.traceId], () => environment.within(() => run(environment)));
  } finally {
    try { await matcher.settled(); } finally { gateway.disconnect(session.sessionId, "recorded_trace_session.ended"); }
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

function refused(reasonCode: AutomationStudioOfflineTrialRefusal["reasonCode"], detail: string): AutomationStudioOfflineTrialRefusal {
  return { status: "refused", reasonCode, detail };
}
