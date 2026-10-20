// Test support for the gateway trace episodes: an episodes object over one
// in-memory store per project, a stepping clock, sequential trace ids, and a
// gateway-shaped event written field by name.

import type { ClientGatewayTraceEvent, ClientGatewayTraceEventInput, ClientGatewayTracePayloadInput, ClientGatewayTraceStore } from "../../../../../client-gateway/index.ts";
import { ClientGatewayTraceMemoryStore } from "../../../../../client-gateway/index.ts";
import type { AutomationStudioGatewayTraceEpisode, AutomationStudioGatewayTraceEpisodesOptions, AutomationStudioGatewayTraceFailure } from "../index.ts";
import { AutomationStudioGatewayTraceEpisodes } from "../index.ts";

export type EpisodesHarness = {
  episodes: AutomationStudioGatewayTraceEpisodes;
  stores: Map<string, ClientGatewayTraceMemoryStore>;
  storeRequests: string[];
  failures: AutomationStudioGatewayTraceFailure[];
};

export function newEpisodes(overrides: Partial<AutomationStudioGatewayTraceEpisodesOptions> = {}): EpisodesHarness {
  const stores = new Map<string, ClientGatewayTraceMemoryStore>();
  const storeRequests: string[] = [];
  const failures: AutomationStudioGatewayTraceFailure[] = [];
  let clock = Date.parse("2026-10-20T10:00:00.000Z");
  let traces = 0;
  const episodes = new AutomationStudioGatewayTraceEpisodes({
    enabled: true,
    storeFor: (projectId: string): ClientGatewayTraceStore => {
      storeRequests.push(projectId);
      const known = stores.get(projectId);
      if (known !== undefined) return known;
      const created = new ClientGatewayTraceMemoryStore();
      stores.set(projectId, created);
      return created;
    },
    now: () => {
      clock += 1;
      return clock;
    },
    flush: { everyEvents: 1000, intervalMs: 60_000 },
    contractVersions: { "client-gateway": "1" },
    gatewayStreams: ["gateway"],
    newTraceId: () => {
      traces += 1;
      return `trace-${traces}`;
    },
    reportFailure: (failure) => failures.push(failure),
    ...overrides
  });
  return { episodes, stores, storeRequests, failures };
}

export function episode(fields: Partial<AutomationStudioGatewayTraceEpisode> = {}): AutomationStudioGatewayTraceEpisode {
  return {
    projectId: "project-1",
    episodeId: "run-1",
    activity: "execution",
    context: { schema: { name: "automation-studio.run-context", version: "1" }, value: { flowId: "flow-1" } },
    ...fields
  };
}

export function gatewayEvent(payload: ClientGatewayTracePayloadInput, messageType = "client.state_update"): ClientGatewayTraceEventInput {
  return {
    stream: "gateway",
    kind: "inbound",
    messageType,
    source: { id: "msg-1", sequence: null, timestamp: null },
    correlation: { commandId: null, recordingId: null, causationEventId: null, owner: null, observationRevision: null, baseRevision: null },
    payloadSchema: null,
    payload,
    artifactIds: [],
    redactions: []
  };
}

/** Every stored event of a trace; none when nothing was flushed yet. */
export async function storedEvents(store: ClientGatewayTraceStore | undefined, traceId: string): Promise<readonly ClientGatewayTraceEvent[]> {
  if (store === undefined) return [];
  const manifest = await store.readManifest(traceId);
  if (manifest === undefined) return [];
  return store.readEventRange(traceId, 1, Number.MAX_SAFE_INTEGER);
}
