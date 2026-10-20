// The fresh gateway a trace is replayed through (traces and offline trials,
// P3): an ordinary `ClientGatewayService` -- the same intake, settle, event bus
// and tap as live -- run on the recording's ids and clock, with waits that run
// out only when the replay says so, a private command ledger, and its own tap
// recording into a memory store under the original trace id, so stamps and
// event ids read as the original's. The recorder declares the trace derived
// (T24): a replay's capture is never live evidence.

import type { ClientGatewayHostLease } from "@fluxiq/contracts/client-gateway";
import { ClientGatewayService } from "../../service.ts";
import type { ClientGatewayCommandOwnerRef } from "../../service/index.ts";
import { ClientGatewayTraceMemoryStore, ClientGatewayTraceRecorder, type ClientGatewayTraceManifest, type ClientGatewayTraceSink } from "../../trace/index.ts";
import { ClientGatewayTraceReplayLedger } from "./ledger.ts";
import type { ClientGatewayTraceReplaySources } from "./sources.ts";
import type { ClientGatewayTraceReplayTimers } from "./timers.ts";

/** What the replayed gateway reads as its dispatching context, set by the replay around each call. */
export type ClientGatewayTraceReplayContext = {
  /** The trace a command is issued inside, as the original's traced episode was. */
  current: ClientGatewayTraceSink | undefined;
  owner: ClientGatewayCommandOwnerRef | undefined;
  lease: ClientGatewayHostLease | undefined;
};

export type ClientGatewayTraceReplayGateway = {
  readonly gateway: ClientGatewayService;
  readonly recorder: ClientGatewayTraceRecorder;
  readonly store: ClientGatewayTraceMemoryStore;
  readonly context: ClientGatewayTraceReplayContext;
};

/** Events and artifact bytes a replay's recorder holds before flushing, at most: far above any one step. */
const REPLAY_BUFFER = Object.freeze({ events: 1_000_000, artifactBytes: 1_073_741_824 });

export function createClientGatewayTraceReplayGateway(input: {
  manifest: ClientGatewayTraceManifest;
  sources: ClientGatewayTraceReplaySources;
  timers: ClientGatewayTraceReplayTimers;
  commandTimeoutMs: number | undefined;
}): ClientGatewayTraceReplayGateway {
  const manifest = input.manifest;
  const store = new ClientGatewayTraceMemoryStore();
  const sourceTraceIds = manifest.origin.kind === "derived" ? manifest.origin.sourceTraceIds : [manifest.traceId];
  const recorder = new ClientGatewayTraceRecorder({
    traceId: manifest.traceId,
    episodeId: manifest.episodeId,
    activity: manifest.activity,
    origin: { kind: "derived", derivation: "replay", sourceTraceIds },
    contractVersions: manifest.contractVersions,
    capabilities: manifest.capabilities,
    context: { schema: manifest.context.schema, value: manifest.context.value },
    streams: manifest.streams
  }, { store, now: input.sources.now, maxBufferedEvents: REPLAY_BUFFER.events, maxBufferedArtifactBytes: REPLAY_BUFFER.artifactBytes });
  const context: ClientGatewayTraceReplayContext = { current: undefined, owner: undefined, lease: undefined };
  const ledger = new ClientGatewayTraceReplayLedger(input.sources.now);
  const gateway = new ClientGatewayService({
    now: input.sources.now,
    createId: input.sources.createId,
    startTimer: input.timers.start,
    ...(input.commandTimeoutMs !== undefined ? { commandTimeoutMs: input.commandTimeoutMs } : {}),
    trace: { current: () => context.current },
    commandOwner: () => context.owner,
    // The recorded lease is the scope's own and current: whether it was stale is what a refusal records, and a refusal is a capture gap.
    hostLease: { current: () => context.lease, isCurrent: () => true, requiresLease: () => false },
    resolveCommandLedger: async () => ({ ledger, close: async () => undefined })
  });
  return { gateway, recorder, store, context };
}
