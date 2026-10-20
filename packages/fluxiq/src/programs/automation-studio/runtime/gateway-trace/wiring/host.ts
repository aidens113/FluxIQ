// What the host that builds the runtime wires for client gateway traces (D11,
// `programs/_shared/runtime.ts`): with tracing on, one episodes object over the
// service's own per-project pool (D10), declaring the gateway tap's streams and
// the contract versions a reader checks, installed for the service's build,
// run and trial ports to find; the capture source the client gateway is
// handed; and the candidate start hook, recording its answers. Off: nothing is
// built, installed or passed, and the start hook is the one given.
//
// The pool is asked for when an episode opens, not now: the service that owns
// it is constructed after the start hook it is handed. A service without
// project storage (in-process hosts and tests) keeps its traces in memory.

import {
  CLIENT_GATEWAY_PROTOCOL_VERSION,
  CLIENT_GATEWAY_TRACE_CAPTURE_BOUNDARY_VERSION,
  CLIENT_GATEWAY_TRACE_SCHEMA_VERSION,
  CLIENT_GATEWAY_TRACE_TAP_STREAMS,
  ClientGatewayTraceMemoryStore,
  type ClientGatewayTraceStore
} from "../../../../../client-gateway/index.ts";
import type { AutomationStudioProjectDatabasePool } from "../../../storage/index.ts";
import { AutomationStudioGatewayTraceEpisodes } from "../episodes.ts";
import { AutomationStudioGatewayTraceInstallation } from "../installation.ts";
import { AutomationStudioGatewayTraceProjectStore } from "./project-store.ts";
import { automationStudioGatewayTraceStartHook } from "./start-hook.ts";
import type { AutomationStudioGatewayTraceEpisodesOptions } from "../types.ts";
import type { AutomationStudioGatewayTraceHost } from "./types.ts";

/** Buffered events are written every 256 events, and every second while any wait. */
const HOST_FLUSH = Object.freeze({ everyEvents: 256, intervalMs: 1_000 });

const OFF: AutomationStudioGatewayTraceHost = Object.freeze({ episodes: undefined, source: undefined, startHook: (hook) => hook, uninstall: () => undefined });

/**
 * Builds and installs the host's trace episodes when `enabled`. A process
 * that already has episodes installed (a second runtime in one process) keeps
 * those, and this runtime traces nothing: its episodes would write through
 * another service's pool.
 */
export function createAutomationStudioGatewayTraceHost(input: {
  enabled: boolean;
  pool: () => AutomationStudioProjectDatabasePool | undefined;
  options?: Partial<Pick<AutomationStudioGatewayTraceEpisodesOptions, "now" | "flush" | "newTraceId" | "reportFailure">>;
}): AutomationStudioGatewayTraceHost {
  if (!input.enabled) return OFF;
  if (AutomationStudioGatewayTraceInstallation.current() !== undefined) {
    console.error("Client gateway tracing is already installed in this process; this runtime records no traces.");
    return OFF;
  }
  const memory = new Map<string, ClientGatewayTraceMemoryStore>();
  const storeFor = (projectId: string): ClientGatewayTraceStore => {
    const pool = input.pool();
    if (pool !== undefined) return new AutomationStudioGatewayTraceProjectStore({ pool, projectId });
    const kept = memory.get(projectId) ?? new ClientGatewayTraceMemoryStore();
    memory.set(projectId, kept);
    return kept;
  };
  const episodes = new AutomationStudioGatewayTraceEpisodes({
    enabled: true,
    storeFor,
    now: input.options?.now ?? Date.now,
    flush: input.options?.flush ?? HOST_FLUSH,
    contractVersions: {
      "client-gateway.protocol": CLIENT_GATEWAY_PROTOCOL_VERSION,
      "client-gateway.trace-schema": String(CLIENT_GATEWAY_TRACE_SCHEMA_VERSION),
      "client-gateway.trace-capture-boundary": String(CLIENT_GATEWAY_TRACE_CAPTURE_BOUNDARY_VERSION)
    },
    gatewayStreams: Object.values(CLIENT_GATEWAY_TRACE_TAP_STREAMS),
    ...(input.options?.newTraceId ? { newTraceId: input.options.newTraceId } : {}),
    ...(input.options?.reportFailure ? { reportFailure: input.options.reportFailure } : {})
  });
  const uninstall = AutomationStudioGatewayTraceInstallation.install(episodes);
  return {
    episodes,
    source: episodes.gatewaySource,
    startHook: (hook) => (hook === undefined ? undefined : automationStudioGatewayTraceStartHook(hook, episodes)),
    uninstall
  };
}
