// What the host that builds the runtime wires for client gateway traces (D11,
// `programs/_shared/runtime.ts`): with tracing on, one episodes object over the
// service's own per-project pool (D10), declaring the gateway tap's streams and
// the contract versions a reader checks, installed for the service's build,
// run and trial ports to find; the capture source the client gateway is
// handed; the candidate start hook, recording its answers; and, once the
// client gateway exists, offline-first trials in builds over it and these
// traces (trace plan P6). Off: nothing is built, installed or passed, and the
// start hook is the one given.
//
// The pool is asked for when an episode opens, not now: the service that owns
// it is constructed after the start hook it is handed. A service without
// project storage (in-process hosts and tests) keeps its traces in memory.
// Persisted traces are sealed with the protection of the service that adopted
// the pool, read from where that service keeps it (`./service-pools.ts`), so
// the trace store and the service's content stores never disagree.

import {
  CLIENT_GATEWAY_PROTOCOL_VERSION,
  CLIENT_GATEWAY_TRACE_CAPTURE_BOUNDARY_VERSION,
  CLIENT_GATEWAY_TRACE_SCHEMA_VERSION,
  CLIENT_GATEWAY_TRACE_TAP_STREAMS,
  ClientGatewayTraceMemoryStore,
  type ClientGatewayTraceStore
} from "../../../../../client-gateway/index.ts";
import type { AutomationStudioProjectDatabasePool } from "../../../storage/index.ts";
// From its owner, not the barrel: `../../service/offline-first/index.ts` leads back here through the trial runners.
import { AutomationStudioOfflineTrialInstallation } from "../../service/offline-first/installation.ts";
import { AutomationStudioGatewayTraceEpisodes } from "../episodes.ts";
import { AutomationStudioGatewayTraceInstallation } from "../installation.ts";
import { AutomationStudioGatewayTraceProjectStore } from "./project-store.ts";
import { automationStudioOfflineTrialSessionView } from "./offline-trial-session-view.ts";
import { AutomationStudioGatewayTraceServicePools } from "./service-pools.ts";
import { automationStudioGatewayTraceStartHook } from "./start-hook.ts";
import type { AutomationStudioGatewayTraceEpisodesOptions } from "../types.ts";
import type { AutomationStudioGatewayTraceHost } from "./types.ts";

/** Buffered events are written every 256 events, and every second while any wait. */
const HOST_FLUSH = Object.freeze({ everyEvents: 256, intervalMs: 1_000 });

const OFF: AutomationStudioGatewayTraceHost = Object.freeze({ episodes: undefined, source: undefined, startHook: (hook) => hook, storeFor: undefined, installOfflineTrials: () => undefined, uninstall: () => undefined });

/**
 * Builds and installs the host's trace episodes when `enabled`, in place of
 * any a runtime built earlier in this process installed: the newest runtime is
 * the serving one (`../installation.ts`), and its gateway records through these
 * episodes, which write through its own service's pool.
 */
export function createAutomationStudioGatewayTraceHost(input: {
  enabled: boolean;
  pool: () => AutomationStudioProjectDatabasePool | undefined;
  options?: Partial<Pick<AutomationStudioGatewayTraceEpisodesOptions, "now" | "flush" | "newTraceId" | "reportFailure">>;
}): AutomationStudioGatewayTraceHost {
  if (!input.enabled) return OFF;
  const memory = new Map<string, ClientGatewayTraceMemoryStore>();
  const storeFor = (projectId: string): ClientGatewayTraceStore => {
    const pool = input.pool();
    if (pool !== undefined) return new AutomationStudioGatewayTraceProjectStore({ pool, projectId, protection: AutomationStudioGatewayTraceServicePools.protectionOf(pool) });
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
  const uninstallEpisodes = AutomationStudioGatewayTraceInstallation.install(episodes);
  // Offline-first trials (trace plan P6, D44) read the traces these episodes write; no reevaluator yet (tier 1).
  let uninstallOfflineTrials = (): void => undefined;
  return {
    episodes,
    source: episodes.gatewaySource,
    startHook: (hook) => (hook === undefined ? undefined : automationStudioGatewayTraceStartHook(hook, episodes)),
    storeFor,
    installOfflineTrials: (gateway) => {
      uninstallOfflineTrials();
      uninstallOfflineTrials = AutomationStudioOfflineTrialInstallation.install({ gateway, storeFor, sessionViewFor: (projectId) => automationStudioOfflineTrialSessionView(gateway, projectId) });
    },
    uninstall: () => {
      uninstallOfflineTrials();
      uninstallEpisodes();
    }
  };
}
