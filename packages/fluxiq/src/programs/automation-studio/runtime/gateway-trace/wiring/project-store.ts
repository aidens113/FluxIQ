// A project's persisted trace store, opened for each operation over the
// service's own per-project pool (D10). The episodes choose a store
// synchronously when an episode opens, while the SQLite store opens
// asynchronously and holds a database lease while open; so each read or write
// opens the store, does its one operation and closes it again. The pool keeps
// the connection warm between them (its idle grace), and no lease outlives an
// operation, so a trace never holds a project open or blocks its removal.
//
// Each open reads the service's project content protection again and seals
// with it when one is configured (lane T P3-E2), exactly as the service's own
// protected content stores do; with none, traces are stored as before.

import type {
  ClientGatewayTraceArtifactPresence,
  ClientGatewayTraceCorrelationKey,
  ClientGatewayTraceEvent,
  ClientGatewayTraceManifest,
  ClientGatewayTraceStore
} from "../../../../../client-gateway/index.ts";
import type { AutomationStudioProjectDatabasePool } from "../../../storage/index.ts";
// From the store's own directory, not the storage barrel, whose stores import the executor, which leads back here.
import { AutomationStudioProjectGatewayTraceStore } from "../../../storage/project/gateway-trace/index.ts";
import type { AutomationStudioGatewayTraceProtectionSource } from "./types.ts";

export class AutomationStudioGatewayTraceProjectStore implements ClientGatewayTraceStore {
  private readonly pool: AutomationStudioProjectDatabasePool;
  private readonly projectId: string;
  private readonly protection: AutomationStudioGatewayTraceProtectionSource;

  constructor(input: { pool: AutomationStudioProjectDatabasePool; projectId: string; protection: AutomationStudioGatewayTraceProtectionSource }) {
    this.pool = input.pool;
    this.projectId = input.projectId;
    this.protection = input.protection;
  }

  writeArtifact(traceId: string, artifactId: string, bytes: Uint8Array): Promise<void> {
    return this.with((store) => store.writeArtifact(traceId, artifactId, bytes));
  }

  appendEvents(traceId: string, events: readonly ClientGatewayTraceEvent[]): Promise<void> {
    return this.with((store) => store.appendEvents(traceId, events));
  }

  writeManifest(manifest: ClientGatewayTraceManifest): Promise<void> {
    return this.with((store) => store.writeManifest(manifest));
  }

  readManifest(traceId: string): Promise<ClientGatewayTraceManifest | undefined> {
    return this.with((store) => store.readManifest(traceId));
  }

  readEventRange(traceId: string, from: number, to: number): Promise<readonly ClientGatewayTraceEvent[]> {
    return this.with((store) => store.readEventRange(traceId, from, to));
  }

  readEventsByCorrelation(traceId: string, key: ClientGatewayTraceCorrelationKey, value: string): Promise<readonly ClientGatewayTraceEvent[]> {
    return this.with((store) => store.readEventsByCorrelation(traceId, key, value));
  }

  readArtifact(traceId: string, artifactId: string): Promise<Uint8Array | undefined> {
    return this.with((store) => store.readArtifact(traceId, artifactId));
  }

  listArtifacts(traceId: string): Promise<readonly ClientGatewayTraceArtifactPresence[]> {
    return this.with((store) => store.listArtifacts(traceId));
  }

  /** Opens the store with the protection configured now, runs one operation, and closes it however the operation ended. */
  private async with<T>(operation: (store: AutomationStudioProjectGatewayTraceStore) => Promise<T>): Promise<T> {
    const protection = this.protection();
    const store = await AutomationStudioProjectGatewayTraceStore.open({ pool: this.pool, projectId: this.projectId, ...(protection === undefined ? {} : { protection }) });
    try {
      return await operation(store);
    } finally {
      await store.close();
    }
  }
}
