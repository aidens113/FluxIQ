// Client gateway traces persisted in a project's SQLite database (trace-offline-
// trials-plan, lane T P2, D10). The reference semantics are the memory store's
// (`client-gateway/trace/memory-store.ts`): appends are all or nothing and in
// strictly increasing sequence order, an artifact id is never rewritten with
// different bytes, and reading a trace nothing was written for throws rather
// than answering empty. A missing manifest is `undefined`, as the contract says.
//
// An event's JSON is kept inline below `GATEWAY_TRACE_CHUNK_BOUNDS.inlineBelowBytes`,
// otherwise cut into content-defined chunks stored once per project
// (`../gateway-trace-chunk-codec/chunk-bounds.ts`, lane T P3): a view repeated from command to command is kept
// once, not once per event. Rows 0030 wrote with the JSON in one content object
// still read. Artifact bytes always go to the content store, and every content
// object a trace uses carries an owner reference
// `{ ownerKind: "client_gateway_trace", ownerId: traceId }`, which pins it
// against the content sweep. Deleting the trace deletes its rows, its chunk
// uses (freeing chunks no other trace uses) and its references in one
// transaction, and the next sweep frees the content bytes.
//
// A chunked event whose chunk is gone or damaged throws when read ("not held"),
// as an event whose content object is gone does: never a shortened payload.
//
// Opened with a content protection (lane T P3-E), no event JSON stays inline and
// every chunk and artifact is sealed with it (`../gateway-trace-chunk-codec/seal-chunk.ts`,
// `../gateway-trace-chunk-rows/protect-chunks.ts`).
// It also opens the project's content-address keyring (t745; a keyring that
// cannot open fails the open): new chunks are cut and addressed under its
// current key, artifact digests are keyed and manifests sealed
// (`../gateway-trace-chunk-codec/keyed-digests.ts`, `manifest-row.ts`). Every row records its form, so rows in the old form
// (null key id) still read, by any store; keyed rows read only with the keyring.
// A protected open first converts what the project already holds to the keyed
// forms (`../gateway-trace-rekey/`): old-form event bodies re-cut into keyed
// sealed chunks, old-form chunks dropped, artifact digests keyed and their
// objects sealed, manifests sealed. Its counts are the store's `rekey`.
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
import { AutomationStudioSchemaMigrationRunner } from "../../schema-migrations.ts";
import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../administration.ts";
import { AUTOMATION_STUDIO_CONTENT_ADDRESS_MIGRATION, openAutomationStudioContentAddressKeyring } from "../content-address/index.ts";
import type { AutomationStudioProjectContentProtection } from "../content-protection.ts";
import { AutomationStudioProjectContentStore } from "../content-store.ts";
import type { AutomationStudioProjectDatabaseLease, AutomationStudioProjectDatabasePool, AutomationStudioSqlExecutor } from "../database.ts";
import { rekeyGatewayTraceStore } from "../gateway-trace-rekey/index.ts";
import type { GatewayTraceRekeyOptions, GatewayTraceRekeyResult } from "../gateway-trace-rekey/index.ts";
import { gatewayTraceArtifactRowDigest, prepareGatewayTraceEventBody } from "../gateway-trace-chunk-codec/index.ts";
import type { GatewayTraceChunkSealing, GatewayTraceChunkedBodyRef, GatewayTraceEventBody } from "../gateway-trace-chunk-codec/index.ts";
import { deleteGatewayTraceChunkUses, readGatewayTraceChunkedBodies, writeGatewayTraceChunks } from "../gateway-trace-chunk-rows/index.ts";
import {
  AUTOMATION_STUDIO_CLIENT_GATEWAY_TRACE_CHUNK_MIGRATION,
  AUTOMATION_STUDIO_CLIENT_GATEWAY_TRACE_CHUNK_PROTECTION_MIGRATION,
  AUTOMATION_STUDIO_CLIENT_GATEWAY_TRACE_KEYED_ADDRESS_MIGRATION,
  AUTOMATION_STUDIO_CLIENT_GATEWAY_TRACE_MIGRATION
} from "../gateway-trace-schema/index.ts";
import type { AutomationStudioGatewayTraceChunkSetMeasure } from "./chunk-set-measure.ts";
import { readGatewayTraceManifestRow, writeGatewayTraceManifestRow } from "./manifest-row.ts";
import type { GatewayTraceManifestRow } from "./manifest-row.ts";
import type { AutomationStudioGatewayTraceMeasure } from "./measure.ts";
import { measureGatewayTraceChunkSetRows, measureGatewayTraceRows } from "./measure-rows.ts";

const OWNER_KIND = "client_gateway_trace";

/** Column per indexed correlation key; a closed map, so no caller text reaches the SQL. */
const CORRELATION_COLUMNS: Readonly<Record<ClientGatewayTraceCorrelationKey, string>> = Object.freeze({
  commandId: "command_id",
  recordingId: "recording_id",
  causationEventId: "causation_event_id"
});

type EventRow = {
  trace_id: string;
  sequence: number;
  event_json: string | null;
  event_object_id: string | null;
  event_chunk_digests: Buffer | null;
  event_chunk_address_key_id: string | null;
  event_byte_length: number | null;
};
type ArtifactRow = { artifact_id: string; object_id: string; sha256: string; digest_key_id: string | null; byte_length: number };

/** One event ready to insert: its JSON inline, or the ordered chunks that hold it. */
type EncodedEvent = { event: ClientGatewayTraceEvent; body: GatewayTraceEventBody };

const EVENT_ROW_COLUMNS = "trace_id, sequence, event_json, event_object_id, event_chunk_digests, event_chunk_address_key_id, event_byte_length";
const MANIFEST_ROW_COLUMNS = "trace_id, manifest_json, manifest_encryption";

export class AutomationStudioProjectGatewayTraceStore implements ClientGatewayTraceStore {
  private constructor(
    private readonly lease: AutomationStudioProjectDatabaseLease,
    private readonly content: AutomationStudioProjectContentStore,
    private readonly sealing: GatewayTraceChunkSealing,
    /** What the protected open converted to keyed forms; `undefined` for a store without protection. */
    readonly rekey: GatewayTraceRekeyResult | undefined
  ) {}

  /**
   * With `protection` (the host's project content protection), chunks and artifacts are sealed, and
   * what the project holds in old forms is converted first; `rekey` bounds that run (tests stop it part way).
   */
  static async open(input: {
    pool: AutomationStudioProjectDatabasePool;
    projectId: string;
    protection?: AutomationStudioProjectContentProtection;
    rekey?: GatewayTraceRekeyOptions;
  }): Promise<AutomationStudioProjectGatewayTraceStore> {
    const lease = await input.pool.acquire(input.projectId);
    let content: AutomationStudioProjectContentStore | undefined;
    try {
      const traceMigrations = [AUTOMATION_STUDIO_CLIENT_GATEWAY_TRACE_CHUNK_MIGRATION, AUTOMATION_STUDIO_CLIENT_GATEWAY_TRACE_CHUNK_PROTECTION_MIGRATION];
      const keyedMigrations = [AUTOMATION_STUDIO_CONTENT_ADDRESS_MIGRATION, AUTOMATION_STUDIO_CLIENT_GATEWAY_TRACE_KEYED_ADDRESS_MIGRATION];
      const migrations = [...AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS, AUTOMATION_STUDIO_CLIENT_GATEWAY_TRACE_MIGRATION, ...traceMigrations, ...keyedMigrations];
      await new AutomationStudioSchemaMigrationRunner({ database: lease.database, migrations }).migrate();
      const keyring = input.protection === undefined
        ? undefined
        : await openAutomationStudioContentAddressKeyring({ database: lease.database, projectId: input.projectId, protection: input.protection });
      const sealing: GatewayTraceChunkSealing = { projectId: input.projectId, protection: input.protection, keyring };
      content = await AutomationStudioProjectContentStore.open({ pool: input.pool, projectId: input.projectId, ...(input.protection === undefined ? {} : { protection: input.protection }) });
      const rekey = input.protection === undefined || keyring === undefined
        ? undefined
        : await rekeyGatewayTraceStore({ database: lease.database, sealing: { ...sealing, protection: input.protection, keyring }, content, ...(input.rekey === undefined ? {} : { options: input.rekey }) });
      // Without a protection nothing is sealed; with one the rekey sealed leftover chunks as its last pass.
      return new AutomationStudioProjectGatewayTraceStore(lease, content, sealing, rekey);
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
    const known = await this.artifactRow(traceId, artifactId);
    if (known !== undefined) {
      this.refuseDifferentArtifact(traceId, artifactId, known, copy);
      return;
    }
    const keyId = this.sealing.keyring?.currentKeyId ?? null;
    const sha256 = gatewayTraceArtifactRowDigest({ keyring: this.sealing.keyring, keyId, bytes: copy, traceId, artifactId });
    const written = await this.content.putBytes({
      content: copy,
      mediaType: "application/octet-stream",
      extension: "bin",
      owner: { ownerKind: OWNER_KIND, ownerId: owner, purpose: "artifact" },
      protect: this.sealing.protection !== undefined
    });
    await this.lease.database.run(
      `insert into client_gateway_trace_artifacts (trace_id, artifact_id, object_id, sha256, digest_key_id, byte_length)
       values (?, ?, ?, ?, ?, ?) on conflict (trace_id, artifact_id) do nothing`,
      [traceId, artifactId, written.object.objectId, sha256, keyId, copy.byteLength]
    );
    const stored = await this.artifactRow(traceId, artifactId);
    if (stored === undefined) throw new Error(`artifact ${artifactId} of trace ${traceId} was not persisted`);
    this.refuseDifferentArtifact(traceId, artifactId, stored, copy);
  }

  /** Appends in strictly increasing sequence order; all or nothing. */
  async appendEvents(traceId: string, events: readonly ClientGatewayTraceEvent[]): Promise<void> {
    ownerId(traceId);
    const copies = events.map((event) => frozenEvent(event));
    refuseOutOfOrder(traceId, copies, await lastSequence(this.lease.database, traceId));
    const inlineAllowed = this.sealing.protection === undefined;
    const keyring = this.sealing.keyring;
    const encoded: EncodedEvent[] = copies.map((event) => ({ event, body: prepareGatewayTraceEventBody({ json: JSON.stringify(event), inlineAllowed, ...(keyring === undefined ? {} : { keyring }) }) }));
    const chunks = encoded.flatMap((row) => (row.body.kind === "chunked" ? row.body.chunks : []));
    await this.lease.database.transaction(async (sql) => {
      refuseOutOfOrder(traceId, copies, await lastSequence(sql, traceId));
      await writeGatewayTraceChunks(sql, this.sealing, traceId, chunks);
      for (const row of encoded) await insertEvent(sql, traceId, row);
    });
  }

  /** Sealed in a protected store (`manifest-row.ts`). */
  async writeManifest(manifest: ClientGatewayTraceManifest): Promise<void> {
    ownerId(manifest.traceId);
    await writeGatewayTraceManifestRow(this.lease.database, this.sealing, cloneClientGatewayTraceJson(manifest) as unknown as ClientGatewayTraceManifest);
  }

  async readManifest(traceId: string): Promise<ClientGatewayTraceManifest | undefined> {
    const row = await this.lease.database.get<GatewayTraceManifestRow>(`select ${MANIFEST_ROW_COLUMNS} from client_gateway_traces where trace_id = ?`, [traceId]);
    return row === undefined ? undefined : readGatewayTraceManifestRow(this.sealing, row);
  }

  /** Every manifest, or one episode's, oldest first. No manifest is a true empty answer. */
  async listManifests(input: { episodeId?: string }): Promise<readonly ClientGatewayTraceManifest[]> {
    const rows = input.episodeId === undefined
      ? await this.lease.database.all<GatewayTraceManifestRow>(`select ${MANIFEST_ROW_COLUMNS} from client_gateway_traces order by started_at, trace_id`)
      : await this.lease.database.all<GatewayTraceManifestRow>(`select ${MANIFEST_ROW_COLUMNS} from client_gateway_traces where episode_id = ? order by started_at, trace_id`, [input.episodeId]);
    const manifests: ClientGatewayTraceManifest[] = [];
    for (const row of rows) manifests.push(await readGatewayTraceManifestRow(this.sealing, row));
    return Object.freeze(manifests);
  }

  async readEventRange(traceId: string, from: number, to: number): Promise<readonly ClientGatewayTraceEvent[]> {
    if (Number.isNaN(from) || Number.isNaN(to)) throw new Error(`event range ${from}..${to} of trace ${traceId} is not a number range`);
    await this.requireTrace(traceId);
    const bounded = Number.isFinite(to);
    const sql = `select ${EVENT_ROW_COLUMNS} from client_gateway_trace_events
      where trace_id = ? and sequence >= ?${bounded ? " and sequence <= ?" : ""} order by sequence`;
    const lower = Number.isFinite(from) ? from : 0;
    const rows = await this.lease.database.all<EventRow>(sql, bounded ? [traceId, lower, to] : [traceId, lower]);
    return this.decodeAll(rows);
  }

  async readEventsByCorrelation(traceId: string, key: ClientGatewayTraceCorrelationKey, value: string): Promise<readonly ClientGatewayTraceEvent[]> {
    await this.requireTrace(traceId);
    const column = CORRELATION_COLUMNS[key];
    const rows = await this.lease.database.all<EventRow>(
      `select ${EVENT_ROW_COLUMNS} from client_gateway_trace_events
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

  /** What the store keeps for one trace, by name: events, how they are held, the chunks it uses and shares, its held artifacts. */
  async measureTrace(traceId: string): Promise<AutomationStudioGatewayTraceMeasure> {
    await this.requireTrace(traceId);
    const rows = await measureGatewayTraceRows(this.lease.database, traceId);
    const artifacts = await this.listArtifacts(traceId);
    return Object.freeze({
      traceId,
      ...rows,
      logicalEventBytes: rows.inlineBytes + rows.chunkedLogicalBytes + rows.objectBytes,
      artifacts: artifacts.length,
      artifactBytes: artifacts.reduce((sum, artifact) => sum + artifact.byteLength, 0)
    });
  }

  /** The distinct chunks a set of traces uses, each counted once. Every trace named must be held. */
  async measureTraceChunks(traceIds: readonly string[]): Promise<AutomationStudioGatewayTraceChunkSetMeasure> {
    for (const traceId of traceIds) await this.requireTrace(traceId);
    return measureGatewayTraceChunkSetRows(this.lease.database, traceIds);
  }

  /** Removes the trace's rows, chunk uses and content references together; the content sweep frees the bytes. */
  async deleteTrace(traceId: string): Promise<void> {
    await this.requireTrace(traceId);
    await this.lease.database.transaction(async (sql) => {
      await sql.run("delete from client_gateway_trace_events where trace_id = ?", [traceId]);
      await deleteGatewayTraceChunkUses(sql, traceId);
      await sql.run("delete from client_gateway_trace_artifacts where trace_id = ?", [traceId]);
      await sql.run("delete from client_gateway_traces where trace_id = ?", [traceId]);
      await sql.run("delete from object_references where owner_kind = ? and owner_id = ?", [OWNER_KIND, traceId]);
    });
  }

  /** The rows' events in order; the chunked ones are reassembled together, so a chunk they share is read once. */
  private async decodeAll(rows: readonly EventRow[]): Promise<readonly ClientGatewayTraceEvent[]> {
    const chunked = rows.flatMap((row) => chunkedBodyRef(row));
    const texts = await readGatewayTraceChunkedBodies(this.lease.database, this.sealing, chunked);
    const chunkedText = new Map(chunked.map((ref, index) => [ref.where, texts[index]!]));
    const events: ClientGatewayTraceEvent[] = [];
    for (const row of rows) events.push(await this.decode(row, chunkedText.get(eventWhere(row)) ?? row.event_json));
    return Object.freeze(events);
  }

  private async decode(row: EventRow, text: string | null): Promise<ClientGatewayTraceEvent> {
    const json = text ?? (await this.eventObjectText(row));
    const event = cloneClientGatewayTraceJson(JSON.parse(json)) as unknown as ClientGatewayTraceEvent;
    if (event.traceId !== row.trace_id || event.sequence !== row.sequence) {
      throw new Error(`event row ${row.trace_id}#${row.sequence} holds event ${event.traceId}#${event.sequence}`);
    }
    return event;
  }

  /** A 0030 large event's JSON, kept in one content object. Its object being gone is a failure, never a skipped event. */
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
      "select artifact_id, object_id, sha256, digest_key_id, byte_length from client_gateway_trace_artifacts where trace_id = ? and artifact_id = ?",
      [traceId, artifactId]
    );
  }

  /** An artifact id is never rewritten with other bytes; they are compared in the stored row's own form. */
  private refuseDifferentArtifact(traceId: string, artifactId: string, row: ArtifactRow, bytes: Uint8Array): void {
    const digest = gatewayTraceArtifactRowDigest({ keyring: this.sealing.keyring, keyId: row.digest_key_id, bytes, traceId, artifactId });
    if (row.sha256 !== digest) throw new Error(`artifact ${artifactId} of trace ${traceId} is already stored with different contents`);
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
  const { event, body } = row;
  await sql.run(
    `insert into client_gateway_trace_events
       (trace_id, sequence, event_id, stream, kind, message_type, command_id, recording_id, causation_event_id,
        event_json, event_object_id, event_chunk_digests, event_chunk_address_key_id, event_byte_length)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, null, ?, ?, ?)`,
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
      body.kind === "inline" ? body.json : null,
      body.kind === "chunked" ? body.digests : null,
      body.kind === "chunked" ? body.addressKeyId : null,
      body.kind === "chunked" ? body.byteLength : null
    ]
  );
}

/** A row's chunked body to reassemble; none for an inline or object row. */
function chunkedBodyRef(row: EventRow): GatewayTraceChunkedBodyRef[] {
  if (row.event_chunk_digests === null) return [];
  if (row.event_byte_length === null) throw new Error(`event row ${eventWhere(row)} has chunks but no byte length`);
  return [{ where: eventWhere(row), digests: row.event_chunk_digests, addressKeyId: row.event_chunk_address_key_id, byteLength: row.event_byte_length }];
}

function eventWhere(row: EventRow): string {
  return `${row.trace_id}#${row.sequence}`;
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

/** Events and manifests are plain JSON data; the store keeps and returns deep-frozen copies. */
function frozenEvent(event: ClientGatewayTraceEvent): ClientGatewayTraceEvent {
  return cloneClientGatewayTraceJson(event) as unknown as ClientGatewayTraceEvent;
}
