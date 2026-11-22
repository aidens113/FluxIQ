import type { ClientGatewayClientHello, ClientGatewaySession, ClientGatewayTraceMatcherGapReason, ClientGatewayTraceMatcherReport, ClientGatewayTraceMatcherSessionView } from "../../../../client-gateway/index.ts";
import type { AutomationStudioRunEnvironment } from "../../environment/index.ts";
import type { AutomationStudioOfflineTrialNormalization, AutomationStudioOfflineTrialRefusal, AutomationStudioOfflineTrialSessionInput } from "../offline-trial/index.ts";

/** A scoped recorded reproduction is distinct from a candidate trial's phase policy. */
export type AutomationStudioRecordedTraceSessionInput = Pick<AutomationStudioOfflineTrialSessionInput, "source" | "gateway" | "contractVersions" | "sessionView">;
export type AutomationStudioRecordedTraceEnvironment = AutomationStudioRunEnvironment & {
  /** Aborted at the first recorded evidence gap, including during a domain-only continuation. */
  readonly signal: AbortSignal;
  /** Check before consuming another recorded model response; throws the same fixed error after a gap. */
  assertSupported(): void;
};
export type AutomationStudioRecordedTraceGap = Readonly<{ reason: string; cause: string; ordinal: number }>;
export type AutomationStudioRecordedTraceOutcome<Result> = AutomationStudioOfflineTrialRefusal | {
  status: "ran";
  result: Result;
  matcher: ClientGatewayTraceMatcherReport;
  sessionView: ClientGatewayTraceMatcherSessionView["source"];
  normalizations: AutomationStudioOfflineTrialNormalization[];
  sourceEpisodeId: string;
} | {
  status: "diverged";
  firstGap: AutomationStudioRecordedTraceGap;
  matcher: ClientGatewayTraceMatcherReport;
  sourceEpisodeId: string | null;
};

/** Internal adapter shared with the state engine's existing offline trial lifecycle. */
export type AutomationStudioRecordedTraceClient<Report> = {
  report(): Report & { refusal: { reason: ClientGatewayTraceMatcherGapReason; detail: string } | null };
  sessionView(supplied?: ClientGatewayClientHello): ClientGatewayTraceMatcherSessionView | null;
  attach(scopeId: string, supplied?: ClientGatewayClientHello): ClientGatewaySession;
  deliverOpening(): Promise<void>;
  settled(): Promise<void>;
};

import {
  CLIENT_GATEWAY_PROTOCOL_VERSION,
  CLIENT_GATEWAY_TRACE_CAPTURE_BOUNDARY_VERSION,
  CLIENT_GATEWAY_TRACE_SCHEMA_VERSION
} from "../../../../client-gateway/index.ts";

export const AUTOMATION_STUDIO_RECORDED_TRACE_READER_CONTRACTS: Readonly<Record<string, string>> = Object.freeze({
  "client-gateway.protocol": CLIENT_GATEWAY_PROTOCOL_VERSION,
  "client-gateway.trace-schema": String(CLIENT_GATEWAY_TRACE_SCHEMA_VERSION),
  "client-gateway.trace-capture-boundary": String(CLIENT_GATEWAY_TRACE_CAPTURE_BOUNDARY_VERSION)
});
