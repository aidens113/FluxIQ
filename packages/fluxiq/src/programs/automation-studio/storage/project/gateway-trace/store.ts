// Client gateway traces persisted in a project's SQLite database (trace-offline-
// trials-plan, lane T P2, D10). The reference semantics are the memory store's
// (`client-gateway/trace/memory-store.ts`): appends are all or nothing and in
// strictly increasing sequence order, an artifact id is never rewritten with
// different bytes, and reading a trace nothing was written for throws rather
// than answering empty. A missing manifest is `undefined`, as the contract says.
//
// Events are kept as JSON inline below the object threshold, otherwise in the
// project content store; artifact bytes always go to the content store. Every
// content object a trace uses carries an owner reference
// `{ ownerKind: "client_gateway_trace", ownerId: traceId }`, which pins it
// against the content sweep; deleting the trace deletes its rows and those
// references in one transaction, and the next sweep frees the bytes.
//
// An artifact counts as held only while its content object is there: a listed
// artifact's digest is computed from the bytes the store reads back, so a
// removed object is reported missing by the completeness evaluator, never
// complete.
import { clientGatewayTraceArtifactDigest, cloneClientGatewayTraceJson } from "../../../../../client-gateway/trace/index.ts";
import type {
  ClientGatewayTraceArtifactPresence,
  ClientGatewayTraceCorrelationKey,
  ClientGatewayTraceEvent,
  ClientGatewayTraceManifest,
  ClientGatewayTraceStore
} from "../../../../../client-gateway/trace/index.ts";
import { AUTOMATION_STUDIO_OBJECT_THRESHOLD_BYTES } from "../../object-store.ts";
import { AutomationStudioSchemaMigrationRunner } from "../../schema-migrations.ts";
import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../administration.ts";
import { AutomationStudioProjectContentStore } from "../content-store.ts";
import type { AutomationStudioProjectDatabaseLease, AutomationStudioProjectDatabasePool, AutomationStudioSqlExecutor } from "../database.ts";
import { AUTOMATION_STUDIO_CLIENT_GATEWAY_TRACE_MIGRATION } from "./migration.ts";

const OWNER_KIND = "client_gateway_trace";

/** Column per indexed correlation key; a closed map, so no caller text reaches the SQL. */
const CORRELATION_COLUMNS: Readonly<Record<ClientGatewayTraceCorrelationKey, string>> = Object.freeze({
  commandId: "command_id",
  recordingId: "recording_id",
  causationEventId: "causation_event_id"
});

type ManifestRow = { manifest_json: string };
type EventRow = { trace_id: string; sequence: number; event_json: string | null; event_object_id: string | null };
type ArtifactRow = { artifact_id: string; object_id: string; sha256: string; byte_length: number };

/** One event ready to insert: its JSON inline, or the content object that holds it. */
type EncodedEvent = { event: ClientGatewayTraceEvent; json: string | null; objectId: string | null };

export class AutomationStudioProjectGatewayTraceStore implements ClientGatewayTraceStore {
  private constructor(
    private readonly lease: AutomationStudioProjectDatabaseLease,
    private readonly content: AutomationStudioProjectContentStore
  ) {}

  static async open(input: { pool: AutomationStudioProjectDatabasePool; projectId: string }): Promise<AutomationStudioProjectGatewayTraceStore> {
    const lease = await input.pool.acquire(input.projectId);
    let content: AutomationStudioProjectContentStore | undefined;
    try {
      const migrations = [...AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS, AUTOMATION_STUDIO_CLIENT_GATEWAY_TRACE_MIGRATION];
      await new AutomationStudioSchemaMigrationRunner({ database: lease.database, migrations }).migrate();
      content = await AutomationStudioProjectContentStore.open({ pool: input.pool, projectId: input.projectId });
      return new AutomationStudioProjectGatewayTraceStore(lease, content);
    } catch (error) {
      await content?.close();
      await lease.release();
      throw error;
    }
  }

  async close(): Promise<void> {
    const results = await Promise.allSettled([this.content.close(), this.lease.release()]);
    const errors = results.flatMap((result) => (result.status === "rejected" ? [result.reason] : []));
    if (errors.length > 0) throw new AggregateError(errors, "gateway trace store could not close");
  }

  async writeArtifact(traceId: string, artifactId: string, bytes: Uint8Array): Promise<void> {
    const owner = ownerId(traceId);
    const copy = new Uint8Array(bytes);
    const sha256 = clientGatewayTraceArtifactDigest(copy);
    const known = await this.artifactRow(traceId, artifactId);
    if (known !== undefined) {
      refuseDifferentArtifact(traceId, artifactId, known, sha256);
      return;
    }
    const written = await this.content.putBytes({
      content: copy,
      mediaType: "application/octet-stream",
      extension: "bin",
      owner: { ownerKind: OWNER_KIND, ownerId: owner, purpose: "artifact" }
    });
    await this.lease.database.run(
      `insert into client_gateway_trace_artifacts (trace_id, artifact_id, object_id, sha256, byte_length)
       values (?, ?, ?, ?, ?) on conflict (trace_id, artifact_id) do nothing`,
      [traceId, artifactId, written.object.objectId, sha256, copy.byteLength]
    );
    const stored = await this.artifactRow(traceId, artifactId);
    if (stored === undefined) throw new Error(`artifact ${artifactId} of trace ${traceId} was not persisted`);
    refuseDifferentArtifact(traceId, artifactId, stored, sha256);
  }

  /** Appends in strictly increasing sequence order; all or nothing. */
  async appendEvents(traceId: string, events: readonly ClientGatewayTraceEvent[]): Promise<void> {
    const owner = ownerId(traceId);
    const copies = events.map((event) => frozenEvent(event));
    refuseOutOfOrder(traceId, copies, await lastSequence(this.lease.database, traceId));
    const encoded: EncodedEvent[] = [];
    for (const event of copies) encoded.push(await this.encode(owner, event));
    await this.lease.database.transaction(async (sql) => {
      refuseOutOfOrder(traceId, copies, await lastSequence(sql, traceId));
      for (const row of encoded) await insertEvent(sql, traceId, row);
    });
  }

  async writeManifest(manifest: ClientGatewayTraceManifest): Promise<void> {
    ownerId(manifest.traceId);
    const copy = frozenManifest(manifest);
    await this.lease.database.run(
      `insert into client_gateway_traces
         (trace_id, episode_id, activity, origin_kind, started_at, closed_at, claimed_completeness, manifest_json)
       values (?, ?, ?, ?, ?, ?, ?, ?)
       on conflict (trace_id) do update set
         episode_id = excluded.episode_id,
         activity = excluded.activity,
         origin_kind = excluded.origin_kind,
         started_at = excluded.started_at,
         closed_at = excluded.closed_at,
         claimed_completeness = excluded.claimed_completeness,
         manifest_json = excluded.manifest_json`,
      [copy.traceId, copy.episodeId, copy.activity, copy.origin.kind, copy.startedAt, copy.closedAt, copy.completeness.status, JSON.stringify(copy)]
    );
  }

  async readManifest(traceId: string): Promise<ClientGatewayTraceManifest | undefined> {
    const row = await this.lease.database.get<ManifestRow>("select manifest_json from client_gateway_traces where trace_id = ?", [traceId]);
    return row === undefined ? undefined : parseManifest(row.manifest_json);
  }

  /** Every manifest, or one episode's, oldest first. No manifest is a true empty answer. */
  async listManifests(input: { episodeId?: string }): Promise<readonly ClientGatewayTraceManifest[]> {
    const rows = input.episodeId === undefined
      ? await this.lease.database.all<ManifestRow>("select manifest_json from client_gateway_traces order by started_at, trace_id")
      : await this.lease.database.all<ManifestRow>("select manifest_json from client_gateway_traces where episode_id = ? order by started_at, trace_id", [input.episodeId]);
    return Object.freeze(rows.map((row) => parseManifest(row.manifest_json)));
  }

  async readEventRange(traceId: string, from: number, to: number): Promise<readonly ClientGatewayTraceEvent[]> {
    if (Number.isNaN(from) || Number.isNaN(to)) throw new Error(`event range ${from}..${to} of trace ${traceId} is not a number range`);
    await this.requireTrace(traceId);
    const bounded = Number.isFinite(to);
    const sql = `select trace_id, sequence, event_json, event_object_id from client_gateway_trace_events
      where trace_id = ? and sequence >= ?${bounded ? " and sequence <= ?" : ""} order by sequence`;
    const lower = Number.isFinite(from) ? from : 0;
    const rows = await this.lease.database.all<EventRow>(sql, bounded ? [traceId, lower, to] : [traceId, lower]);
    return this.decodeAll(rows);
  }

  async readEventsByCorrelation(traceId: string, key: ClientGatewayTraceCorrelationKey, value: string): Promise<readonly ClientGatewayTraceEvent[]> {
    await this.requireTrace(traceId);
    const column = CORRELATION_COLUMNS[key];
    const rows = await this.lease.database.all<EventRow>(
      `select trace_id, sequence, event_json, event_object_id from client_gateway_trace_events
       where trace_id = ? and ${column} = ? order by sequence`,
      [traceId, value]
    );
    return this.decodeAll(rows);
  }

  async readArtifact(traceId: string, artifactId: string): Promise<Uint8Array | undefined> {
    await this.requireTrace(traceId);
    const row = await this.artifactRow(traceId, artifactId);
    return row === undefined ? undefined : this.heldBytes(row.object_id);
  }

  /** The artifacts whose content is actually there, each with the digest of the bytes read back. */
  async listArtifacts(traceId: string): Promise<readonly ClientGatewayTraceArtifactPresence[]> {
    await this.requireTrace(traceId);
    const rows = await this.lease.database.all<ArtifactRow>(
      "select artifact_id, object_id, sha256, byte_length from client_gateway_trace_artifacts where trace_id = ? order by rowid",
      [traceId]
    );
    const held: ClientGatewayTraceArtifactPresence[] = [];
    for (const row of rows) {
      const bytes = await this.heldBytes(row.object_id);
      if (bytes === undefined) continue;
      held.push(Object.freeze({ id: row.artifact_id, sha256: clientGatewayTraceArtifactDigest(bytes), byteLength: bytes.byteLength }));
    }
    return Object.freeze(held);
  }

  /** Removes the trace's rows and its content references together; the content sweep frees the bytes. */
  async deleteTrace(traceId: string): Promise<void> {
    await this.requireTrace(traceId);
    await this.lease.database.transaction(async (sql) => {
      await sql.run("delete from client_gateway_trace_events where trace_id = ?", [traceId]);
      await sql.run("delete from client_gateway_trace_artifacts where trace_id = ?", [traceId]);
      await sql.run("delete from client_gateway_traces where trace_id = ?", [traceId]);
      await sql.run("delete from object_references where owner_kind = ? and owner_id = ?", [OWNER_KIND, traceId]);
    });
  }

  private async encode(owner: string, event: ClientGatewayTraceEvent): Promise<EncodedEvent> {
    const json = JSON.stringify(event);
    if (Buffer.byteLength(json, "utf8") < AUTOMATION_STUDIO_OBJECT_THRESHOLD_BYTES) return { event, json, objectId: null };
    const written = await this.content.putBytes({
      content: Buffer.from(json, "utf8"),
      mediaType: "application/json",
      extension: "json",
      owner: { ownerKind: OWNER_KIND, ownerId: owner, purpose: "event" }
    });
    return { event, json: null, objectId: written.object.objectId };
  }

  private async decodeAll(rows: readonly EventRow[]): Promise<readonly ClientGatewayTraceEvent[]> {
    const events: ClientGatewayTraceEvent[] = [];
    for (const row of rows) events.push(await this.decode(row));
    return Object.freeze(events);
  }

  private async decode(row: EventRow): Promise<ClientGatewayTraceEvent> {
    const json = row.event_json ?? (await this.eventObjectText(row));
    const event = cloneClientGatewayTraceJson(JSON.parse(json)) as unknown as ClientGatewayTraceEvent;
    if (event.traceId !== row.trace_id || event.sequence !== row.sequence) {
      throw new Error(`event row ${row.trace_id}#${row.sequence} holds event ${event.traceId}#${event.sequence}`);
    }
    return event;
  }

  /** A large event's JSON. Its object being gone is a failure, never a skipped event. */
  private async eventObjectText(row: EventRow): Promise<string> {
    if (row.event_object_id === null) throw new Error(`event row ${row.trace_id}#${row.sequence} holds no event`);
    const asset = await this.content.readBytesByObjectId(row.event_object_id);
    return asset.content.toString("utf8");
  }

  /**
   * A fresh copy of a content object's bytes, or `undefined` when the object
   * is not there (its row or its file is gone). Any other failure, a digest
   * mismatch included, throws.
   */
  private async heldBytes(objectId: string): Promise<Uint8Array | undefined> {
    const object = await this.lease.database.get<{ object_id: string }>("select object_id from objects where object_id = ?", [objectId]);
    if (object === undefined) return undefined;
    try {
      const asset = await this.content.readBytesByObjectId(objectId);
      return new Uint8Array(asset.content);
    } catch (error) {
      if (isMissingFile(error)) return undefined;
      throw error;
    }
  }

  private artifactRow(traceId: string, artifactId: string): Promise<ArtifactRow | undefined> {
    return this.lease.database.get<ArtifactRow>(
      "select artifact_id, object_id, sha256, byte_length from client_gateway_trace_artifacts where trace_id = ? and artifact_id = ?",
      [traceId, artifactId]
    );
  }

  /** A trace nothing was written for is an error, not an empty answer. */
  private async requireTrace(traceId: string): Promise<void> {
    const row = await this.lease.database.get<{ present: number }>(
      `select (exists (select 1 from client_gateway_traces where trace_id = ?)
            or exists (select 1 from client_gateway_trace_events where trace_id = ?)
            or exists (select 1 from client_gateway_trace_artifacts where trace_id = ?)) as present`,
      [traceId, traceId, traceId]
    );
    if (row?.present !== 1) throw new Error(`trace ${traceId} is not in this store`);
  }
}

/** The trace id as a content owner id: the content store's own id rule, checked before anything is written. */
function ownerId(traceId: string): string {
  if (!/^[A-Za-z0-9._:-]{1,200}$/.test(traceId)) throw new Error(`trace id ${JSON.stringify(traceId)} is not a valid store key`);
  return traceId;
}

function refuseDifferentArtifact(traceId: string, artifactId: string, row: ArtifactRow, sha256: string): void {
  if (row.sha256 !== sha256) throw new Error(`artifact ${artifactId} of trace ${traceId} is already stored with different contents`);
}

function refuseOutOfOrder(traceId: string, events: readonly ClientGatewayTraceEvent[], storedLast: number): void {
  let last = storedLast;
  for (const event of events) {
    if (event.traceId !== traceId) throw new Error(`event ${event.eventId} belongs to trace ${event.traceId}, not ${traceId}`);
    if (!Number.isInteger(event.sequence) || event.sequence <= last) throw new Error(`event sequence ${event.sequence} does not follow ${last} in trace ${traceId}`);
    last = event.sequence;
  }
}

async function lastSequence(sql: AutomationStudioSqlExecutor, traceId: string): Promise<number> {
  const row = await sql.get<{ last: number | null }>("select max(sequence) as last from client_gateway_trace_events where trace_id = ?", [traceId]);
  return row?.last ?? 0;
}

async function insertEvent(sql: AutomationStudioSqlExecutor, traceId: string, row: EncodedEvent): Promise<void> {
  const { event } = row;
  await sql.run(
    `insert into client_gateway_trace_events
       (trace_id, sequence, event_id, stream, kind, message_type, command_id, recording_id, causation_event_id, event_json, event_object_id)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      traceId,
      event.sequence,
      event.eventId,
      event.stream,
      event.kind,
      event.messageType,
      event.correlation.commandId,
      event.correlation.recordingId,
      event.correlation.causationEventId,
      row.json,
      row.objectId
    ]
  );
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

/** Events and manifests are plain JSON data; the store keeps and returns deep-frozen copies. */
function frozenEvent(event: ClientGatewayTraceEvent): ClientGatewayTraceEvent {
  return cloneClientGatewayTraceJson(event) as unknown as ClientGatewayTraceEvent;
}

function frozenManifest(manifest: ClientGatewayTraceManifest): ClientGatewayTraceManifest {
  return cloneClientGatewayTraceJson(manifest) as unknown as ClientGatewayTraceManifest;
}

function parseManifest(json: string): ClientGatewayTraceManifest {
  return frozenManifest(JSON.parse(json) as ClientGatewayTraceManifest);
}
