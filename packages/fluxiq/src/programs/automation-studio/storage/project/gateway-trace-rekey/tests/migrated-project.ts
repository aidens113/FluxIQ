// Test support for the trace rekey (t745 u3b): a project whose traces were all
// written before it had a protection. One trace is written as 0030's store wrote
// it (a small event inline, a large one in one unsealed content object, a
// plaintext manifest), into a database migrated only to 0030; another by a store
// without protection (a small inline event, a large chunked one, two unsealed
// artifacts, a plaintext manifest). Each body carries a marker. The project
// keeps what every read gave before any protected open, the plain SHA-256 of
// every chunk, body and artifact it held, and opens stores over its own pool.
import { createHash } from "node:crypto";
import path from "node:path";
import type { ClientGatewayTraceEvent, ClientGatewayTraceStore } from "../../../../../../client-gateway/trace/index.ts";
import { evaluateClientGatewayTraceCompleteness } from "../../../../../../client-gateway/trace/index.ts";
import { correlation, newRecorder, textEvent } from "../../../../../../client-gateway/trace/tests/trace-builders.ts";
import { AutomationStudioSchemaMigrationRunner } from "../../../schema-migrations.ts";
import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../../administration.ts";
import { AutomationStudioProjectContentStore } from "../../content-store.ts";
import type { AutomationStudioProjectContentProtection } from "../../content-protection.ts";
import { AutomationStudioProjectDatabasePool } from "../../database.ts";
import { AutomationStudioProjectGatewayTraceStore } from "../../gateway-trace/index.ts";
import { AUTOMATION_STUDIO_CLIENT_GATEWAY_TRACE_MIGRATION } from "../../gateway-trace-schema/index.ts";
import { recordTrace, viewText } from "../../gateway-trace/tests/keyed-trace-support.ts";
import type { GatewayTraceRekeyOptions } from "../index.ts";

export const LEGACY_TRACE = "trace-legacy";
export const PLAIN_TRACE = "trace-plain";
export const TRACES = [LEGACY_TRACE, PLAIN_TRACE] as const;

/** What every read of one trace gave, as JSON text, so a later read can be compared byte for byte. */
export type TraceReads = {
  events: string[];
  byCommand: string[];
  manifest: string;
  artifacts: string;
  artifactBytes: string[];
  measure: { events: number; logicalEventBytes: number; artifacts: number; artifactBytes: number };
  completeness: string;
};

export type ProjectReads = { traces: Record<string, TraceReads>; manifests: string };

export class MigratedProject {
  private pool: AutomationStudioProjectDatabasePool;

  private constructor(
    readonly rootDir: string,
    readonly projectId: string,
    /** Every marker a body or artifact carried. */
    readonly markers: readonly string[],
    /** Every event body as it reached the store, every artifact, and each old chunk's digest (filled in by `create`). */
    readonly bodies: string[],
    readonly artifacts: Uint8Array[],
    readonly oldChunkDigests: Buffer[],
    pool: AutomationStudioProjectDatabasePool
  ) {
    this.pool = pool;
  }

  /** Writes both traces and records what they read as. `salt` keeps two projects' contents apart. */
  static async create(rootDir: string, projectId: string, salt: string): Promise<{ project: MigratedProject; before: ProjectReads }> {
    const markers = [`MARK-legacy-small-${salt}`, `MARK-legacy-large-${salt}`, `MARK-plain-small-${salt}`, `MARK-plain-large-${salt}`, `MARK-artifact-${salt}`];
    const project = new MigratedProject(rootDir, projectId, markers, [], [], [], new AutomationStudioProjectDatabasePool({ rootDir }));
    await project.writeLegacyTrace(markers[0]!, markers[1]!);
    const store = await project.open();
    try {
      const artifacts = [Buffer.from(`${markers[4]}:${"a".repeat(3_000)}`, "utf8"), Buffer.from(`second artifact ${salt}`, "utf8")];
      const written = await recordTrace(store, PLAIN_TRACE, [`{"small":"${markers[2]}"}`, `{"large":"${markers[3]}","view":${viewText(8_000, salt)}}`], artifacts);
      project.bodies.push(...written.map((event) => JSON.stringify(event)));
      project.artifacts.push(...artifacts.map((bytes) => new Uint8Array(bytes)));
      const before = await readProject(store);
      project.oldChunkDigests.push(...(await project.rows<{ digest: Buffer }>("select digest from client_gateway_trace_chunks")).map((row) => row.digest));
      return { project, before };
    } finally {
      await store.close();
    }
  }

  get databasePool(): AutomationStudioProjectDatabasePool {
    return this.pool;
  }

  get directory(): string {
    return path.join(this.rootDir, "projects", this.projectId);
  }

  open(input: { protection?: AutomationStudioProjectContentProtection; rekey?: GatewayTraceRekeyOptions } = {}): Promise<AutomationStudioProjectGatewayTraceStore> {
    return AutomationStudioProjectGatewayTraceStore.open({ pool: this.pool, projectId: this.projectId, ...input });
  }

  /** Closes every connection (the WAL is checkpointed and removed) and starts a new pool over the same files. */
  async restartPool(): Promise<void> {
    await this.pool.closeAll();
    this.pool = new AutomationStudioProjectDatabasePool({ rootDir: this.rootDir });
  }

  async closePool(): Promise<void> {
    await this.pool.closeAll();
  }

  async rows<T>(statement: string, params: readonly unknown[] = []): Promise<T[]> {
    const lease = await this.pool.acquire(this.projectId);
    try {
      return await lease.database.all<T>(statement, params);
    } finally {
      await lease.release();
    }
  }

  async sql(statement: string, params: readonly unknown[] = []): Promise<void> {
    const lease = await this.pool.acquire(this.projectId);
    try {
      await lease.database.run(statement, params);
    } finally {
      await lease.release();
    }
  }

  /** The plain SHA-256 needles (raw and hex) of every old chunk, body and artifact, and every marker. */
  needles(): Array<{ label: string; bytes: Buffer }> {
    const digests = [
      ...this.oldChunkDigests.map((digest, index) => ({ label: `old chunk ${index}`, digest })),
      ...this.bodies.map((body, index) => ({ label: `body ${index}`, digest: sha256(body) })),
      ...this.artifacts.map((bytes, index) => ({ label: `artifact ${index}`, digest: sha256(bytes) }))
    ];
    return [
      ...digests.flatMap(({ label, digest }) => [
        { label: `${label} (raw)`, bytes: digest },
        { label: `${label} (hex)`, bytes: Buffer.from(digest.toString("hex"), "utf8") }
      ]),
      ...this.markers.map((marker) => ({ label: marker, bytes: Buffer.from(marker, "utf8") }))
    ];
  }

  /** The legacy trace exactly as 0030's store wrote it, before any later migration ran. */
  private async writeLegacyTrace(smallMarker: string, largeMarker: string): Promise<void> {
    const { recorder, store } = newRecorder({}, { traceId: LEGACY_TRACE, episodeId: "run-legacy" });
    recorder.record(textEvent(`{"small":"${smallMarker}"}`, { correlation: correlation({ commandId: "cmd-1" }) }));
    recorder.record(textEvent(JSON.stringify({ large: largeMarker, body: "<p>".padEnd(300 * 1024, "y") }), { correlation: correlation({ commandId: "cmd-1" }) }));
    const manifest = await recorder.close({ terminationReason: "completed", terminationDetail: null });
    const events = await store.readEventRange(LEGACY_TRACE, 1, 2);
    this.bodies.push(...events.map((event) => JSON.stringify(event)));
    const lease = await this.pool.acquire(this.projectId);
    const content = await AutomationStudioProjectContentStore.open({ pool: this.pool, projectId: this.projectId });
    try {
      const migrations = [...AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS, AUTOMATION_STUDIO_CLIENT_GATEWAY_TRACE_MIGRATION];
      await new AutomationStudioSchemaMigrationRunner({ database: lease.database, migrations }).migrate();
      await lease.database.run(
        `insert into client_gateway_traces (trace_id, episode_id, activity, origin_kind, started_at, closed_at, claimed_completeness, manifest_json)
         values (?, ?, ?, ?, ?, ?, ?, ?)`,
        [LEGACY_TRACE, manifest.episodeId, manifest.activity, manifest.origin.kind, manifest.startedAt, manifest.closedAt, manifest.completeness.status, JSON.stringify(manifest)]
      );
      for (const event of events) await insertLegacyEvent(lease.database, content, event);
    } finally {
      await content.close();
      await lease.release();
    }
  }
}

async function insertLegacyEvent(
  sql: { run(statement: string, params?: readonly unknown[]): Promise<unknown> },
  content: AutomationStudioProjectContentStore,
  event: ClientGatewayTraceEvent
): Promise<void> {
  const json = JSON.stringify(event);
  const large = json.length > 256 * 1024;
  const written = large
    ? await content.putBytes({ content: Buffer.from(json, "utf8"), mediaType: "application/json", extension: "json", owner: { ownerKind: "client_gateway_trace", ownerId: LEGACY_TRACE, purpose: "event" } })
    : undefined;
  await sql.run(
    `insert into client_gateway_trace_events
       (trace_id, sequence, event_id, stream, kind, message_type, command_id, recording_id, causation_event_id, event_json, event_object_id)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [LEGACY_TRACE, event.sequence, event.eventId, event.stream, event.kind, event.messageType, event.correlation.commandId, null, null, large ? null : json, written?.object.objectId ?? null]
  );
}

/** Every read the store answers, for both traces, as JSON text. */
export async function readProject(store: AutomationStudioProjectGatewayTraceStore): Promise<ProjectReads> {
  const traces: Record<string, TraceReads> = {};
  for (const traceId of TRACES) traces[traceId] = await readTrace(store, traceId);
  return { traces, manifests: JSON.stringify(await store.listManifests({})) };
}

async function readTrace(store: AutomationStudioProjectGatewayTraceStore, traceId: string): Promise<TraceReads> {
  const events = await store.readEventRange(traceId, 1, Number.MAX_SAFE_INTEGER);
  const manifest = await store.readManifest(traceId);
  if (manifest === undefined) throw new Error(`trace ${traceId} has no manifest`);
  const artifacts = await store.listArtifacts(traceId);
  const artifactBytes: string[] = [];
  for (const artifact of artifacts) artifactBytes.push(Buffer.from((await store.readArtifact(traceId, artifact.id))!).toString("base64"));
  const measure = await store.measureTrace(traceId);
  return {
    events: events.map((event) => JSON.stringify(event)),
    byCommand: (await store.readEventsByCorrelation(traceId, "commandId", "cmd-1")).map((event) => JSON.stringify(event)),
    manifest: JSON.stringify(manifest),
    artifacts: JSON.stringify(artifacts),
    artifactBytes,
    measure: { events: measure.events, logicalEventBytes: measure.logicalEventBytes, artifacts: measure.artifacts, artifactBytes: measure.artifactBytes },
    completeness: JSON.stringify(await completeness(store, traceId))
  };
}

async function completeness(store: ClientGatewayTraceStore, traceId: string) {
  const manifest = await store.readManifest(traceId);
  if (manifest === undefined) throw new Error(`trace ${traceId} has no manifest`);
  const events = await store.readEventRange(traceId, 1, Number.MAX_SAFE_INTEGER);
  const availableArtifacts = await store.listArtifacts(traceId);
  return evaluateClientGatewayTraceCompleteness({ manifest, events, availableArtifacts, compatibility: { status: "compatible" }, recorderActive: false });
}

function sha256(bytes: Uint8Array | string): Buffer {
  return createHash("sha256").update(bytes).digest();
}
