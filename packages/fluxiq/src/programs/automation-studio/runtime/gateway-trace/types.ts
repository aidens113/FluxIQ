// Types of Automation Studio's client gateway trace episodes (traces and
// offline trials, P2): what opens an episode, how the episodes object is
// built, the flush policy, and the control events recorded for input that
// reaches Core outside the client gateway's socket.

import type {
  ClientGatewayTraceActivity,
  ClientGatewayTraceSchemaRef,
  ClientGatewayTraceStore,
  ClientGatewayTraceTerminationReason
} from "../../../../client-gateway/index.ts";
import type { AUTOMATION_STUDIO_GATEWAY_TRACE_CONTROL } from "./control-vocabulary.ts";

/** What one traced episode is: a build, a trial or a run (D9: episode ids are run ids, or a build's `build.<uuid>`). */
export type AutomationStudioGatewayTraceEpisode = {
  projectId: string;
  episodeId: string;
  activity: ClientGatewayTraceActivity;
  /** The program's opaque context for the manifest (task inputs, candidate), named by its schema. */
  context: { schema: ClientGatewayTraceSchemaRef; value: unknown };
  /** The Flow the episode builds, tests or runs, when it has one: run control for a build arrives keyed `[projectId, flowId]`. */
  flowId?: string;
};

/** When buffered events are written: every `everyEvents` recorded events, and every `intervalMs` while any are buffered. */
export type AutomationStudioGatewayTraceFlushPolicy = {
  everyEvents: number;
  intervalMs: number;
};

/** The recorder's buffer bounds; past them an event is declared lost, never dropped silently. */
export type AutomationStudioGatewayTraceBufferLimits = {
  maxEvents: number;
  maxArtifactBytes: number;
};

/** A capture failure the episodes could not raise into the work it traces (tracing never fails the product). */
export type AutomationStudioGatewayTraceFailure = {
  stage: "open" | "flush" | "close";
  episodeId: string;
  traceId: string | null;
  error: unknown;
};

export type AutomationStudioGatewayTraceEpisodesOptions = {
  /** `FLUXIQ_CLIENT_GATEWAY_TRACE`. Off: `run` only calls its work and no capture source exists. */
  enabled: boolean;
  /** The store a project's traces are written to, chosen when each episode opens. */
  storeFor: (projectId: string) => ClientGatewayTraceStore;
  /** Epoch milliseconds. */
  now: () => number;
  flush: AutomationStudioGatewayTraceFlushPolicy;
  /** Contract name to version, recorded in every manifest. */
  contractVersions: Readonly<Record<string, string>>;
  /** The streams the client gateway's tap records into; the control stream is added to them. */
  gatewayStreams: readonly string[];
  buffer?: AutomationStudioGatewayTraceBufferLimits;
  newTraceId?: () => string;
  /** Where capture failures are reported. Default: `console.error`, naming the stage and episode only. */
  reportFailure?: (failure: AutomationStudioGatewayTraceFailure) => void;
};

/** An input that reached Core outside the socket, recorded as a control event. */
export type AutomationStudioGatewayTraceControlType = (typeof AUTOMATION_STUDIO_GATEWAY_TRACE_CONTROL.types)[number];

/** Explicit correlations a control event carries; each omitted one is `null`. */
export type AutomationStudioGatewayTraceControlCorrelation = {
  commandId?: string;
  recordingId?: string;
  causationEventId?: string;
};

/** Captured content arriving with a control input (an uploaded screenshot). */
export type AutomationStudioGatewayTraceControlArtifact = {
  mediaType: string;
  bytes: Uint8Array;
  /** The live resource's own identity (a content address), or `null`. */
  resourceKey: string | null;
};

/** One control event: what arrived, as JSON, with any content it carried. */
export type AutomationStudioGatewayTraceControlEvent = {
  type: AutomationStudioGatewayTraceControlType;
  payload: unknown;
  correlation?: AutomationStudioGatewayTraceControlCorrelation;
  artifact?: AutomationStudioGatewayTraceControlArtifact;
};

/** How a closed episode ended. */
export type AutomationStudioGatewayTraceTermination = {
  terminationReason: ClientGatewayTraceTerminationReason;
  terminationDetail: string | null;
};

