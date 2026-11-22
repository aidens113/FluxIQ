import { ClientGatewayTraceMatcher } from "../../../../client-gateway/index.ts";
import type { AutomationStudioRecordedTraceEnvironment, AutomationStudioRecordedTraceGap, AutomationStudioRecordedTraceOutcome, AutomationStudioRecordedTraceSessionInput } from "./contracts.ts";
import { automationStudioRecordedTraceLifecycle } from "./lifecycle.ts";

/** Strict recorded-domain scope: no reevaluator, live session fallback or candidate-trial phase override. */
export async function runAutomationStudioRecordedTraceSession<Result>(input: AutomationStudioRecordedTraceSessionInput, run: (environment: AutomationStudioRecordedTraceEnvironment) => Promise<Result>): Promise<AutomationStudioRecordedTraceOutcome<Result>> {
  const { source, gateway } = input;
  const controller = new AbortController();
  let matcher: ClientGatewayTraceMatcher | undefined;
  let firstGap: AutomationStudioRecordedTraceGap | undefined;
  let failure: Error | undefined;
  const observe = (): void => {
    if (failure || !matcher) return;
    const report = matcher.report();
    const gap = report.gaps[0];
    if (!gap && !report.refusedDeliveries.length) return;
    firstGap = gap ? { reason: gap.reason, cause: gap.cause, ordinal: gap.ordinal } : { reason: "incomplete_capture", cause: "failed_delivery", ordinal: 0 };
    failure = Object.assign(new Error("recorded_trace.evidence_gap"), { code: "recorded_trace.evidence_gap", firstGap });
    controller.abort(failure);
  };
  const assertSupported = (): void => {
    observe();
    if (failure) throw failure;
  };
  const guardedGateway = {
    attachScopedSession: gateway.attachScopedSession.bind(gateway),
    receiveRaw: (...args: Parameters<typeof gateway.receiveRaw>) => {
      observe();
      return gateway.receiveRaw(...args);
    },
    receiveTraceArtifact: (...args: Parameters<typeof gateway.receiveTraceArtifact>) => {
      observe();
      return gateway.receiveTraceArtifact(...args);
    },
  };
  try {
    const session = await automationStudioRecordedTraceLifecycle(input, async (clock, contractVersions) => {
      matcher = await ClientGatewayTraceMatcher.load({ store: source.store, traceId: source.traceId, gateway: guardedGateway, clock, contractVersions, ...(source.sessionRef === undefined ? {} : { sessionRef: source.sessionRef }) });
      return matcher;
    }, async (environment) => {
      assertSupported();
      const result = await run(Object.freeze({ ...environment, signal: controller.signal, assertSupported }));
      assertSupported();
      return result;
    });
    if (session.status === "refused") return session;
    assertSupported();
    const { trial: result, report, ...receipt } = session;
    return { ...receipt, result, matcher: report };
  } catch (error) {
    observe();
    if (!firstGap || !matcher) throw error;
    return { status: "diverged", firstGap, matcher: matcher.report(), sourceEpisodeId: matcher.report().sourceEpisodeId };
  } finally {
    if (!controller.signal.aborted) controller.abort(new Error("recorded_trace.session_ended"));
  }
}
