import { createHash } from "node:crypto";
import type { AutomationStudioProjectDatabaseLease, AutomationStudioProjectDatabasePool } from "./project-database.ts";
import { AutomationStudioProjectContentStore } from "./project-content-store.ts";

export type AutomationStudioEventStreamKind = "runtime" | "recording";
export type AutomationStudioChunkEvent = { sequence: number; [key: string]: unknown };
export type AutomationStudioEventChunkDocument = {
  schemaVersion: "automation-studio.event-chunk.v1";
  streamKind: AutomationStudioEventStreamKind;
  streamId: string;
  firstSequence: number;
  lastSequence: number;
  events: AutomationStudioChunkEvent[];
};
export type AutomationStudioEventChunkRecord = {
  chunkId: string;
  streamKind: AutomationStudioEventStreamKind;
  streamId: string;
  firstSequence: number;
  lastSequence: number;
  eventCount: number;
  byteCount: number;
  objectId: string;
  sha256: string;
  closed: boolean;
  createdAt: number;
  firstEventAt: number | null;
  lastEventAt: number | null;
};
export type AutomationStudioEventCursorPage = { events: AutomationStudioChunkEvent[]; nextCursor: string | null; hasMore: boolean };

export class AutomationStudioProjectEventChunkStore {
  private constructor(private readonly content: AutomationStudioProjectContentStore, private readonly lease: AutomationStudioProjectDatabaseLease) {}

  static async open(input: { pool: AutomationStudioProjectDatabasePool; projectId: string }): Promise<AutomationStudioProjectEventChunkStore> {
    const content = await AutomationStudioProjectContentStore.open(input);
    try {
      const lease = await input.pool.acquire(input.projectId);
      return new AutomationStudioProjectEventChunkStore(content, lease);
    } catch (error) {
      await content.close();
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.lease.release();
    await this.content.close();
  }

  async writeChunk(input: { streamKind: AutomationStudioEventStreamKind; streamId: string; events: AutomationStudioChunkEvent[]; maxEvents?: number; maxBytes?: number; createdAt?: number; transactionId?: string }): Promise<AutomationStudioEventChunkRecord> {
    const events = validateEvents(input.events, input.maxEvents ?? 2_000);
    const firstSequence = events[0]!.sequence;
    const lastSequence = events[events.length - 1]!.sequence;
    const document: AutomationStudioEventChunkDocument = { schemaVersion: "automation-studio.event-chunk.v1", streamKind: input.streamKind, streamId: requiredId(input.streamId, "stream"), firstSequence, lastSequence, events };
    const content = Buffer.from(JSON.stringify(document), "utf8");
    const maxBytes = Math.max(1, Math.trunc(input.maxBytes ?? 4 * 1024 * 1024));
    if (content.length > maxBytes) throw new Error(`Automation Studio event chunk exceeds ${maxBytes} bytes.`);
    const written = await this.content.putBytes({
      content,
      mediaType: "application/vnd.fluxiq.automation-event-chunk+json",
      extension: "json",
      owner: { ownerKind: input.streamKind === "runtime" ? "runtime_run" : "recording", ownerId: input.streamId, purpose: "event_chunk", referenceId: `reference:${input.streamKind}:${input.streamId}:${firstSequence}` },
      ...(input.transactionId !== undefined ? { transactionId: input.transactionId } : {}),
      ...(input.createdAt !== undefined ? { createdAt: input.createdAt } : {})
    });
    const timeRange = eventTimeRange(events);
    const chunkId = `chunk:${input.streamKind}:${input.streamId}:${firstSequence}`;
    const createdAt = input.createdAt ?? Date.now();
    const rowInput = [chunkId, input.streamId, firstSequence, lastSequence, events.length, content.length, written.object.objectId, written.object.sha256, 1, createdAt, timeRange.firstEventAt, timeRange.lastEventAt];
    if (input.streamKind === "runtime") {
      await this.lease.database.run(
        `insert into runtime_event_chunks (chunk_id, run_id, first_sequence, last_sequence, event_count, byte_count, object_id, sha256, closed, created_at_ms, first_event_at_ms, last_event_at_ms)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        rowInput
      );
    } else {
      await this.lease.database.run(
        `insert into recording_event_chunks (chunk_id, recording_id, first_sequence, last_sequence, event_count, byte_count, object_id, sha256, closed, created_at_ms, first_event_at_ms, last_event_at_ms)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        rowInput
      );
    }
    return { chunkId, streamKind: input.streamKind, streamId: input.streamId, firstSequence, lastSequence, eventCount: events.length, byteCount: content.length, objectId: written.object.objectId, sha256: written.object.sha256, closed: true, createdAt, firstEventAt: timeRange.firstEventAt, lastEventAt: timeRange.lastEventAt };
  }

  async readEventsBySequence(input: { streamKind: AutomationStudioEventStreamKind; streamId: string; afterSequence?: number; limit?: number }): Promise<AutomationStudioEventCursorPage> {
    const limit = clampLimit(input.limit);
    const afterSequence = Math.max(0, Math.trunc(input.afterSequence ?? 0));
    const rows = input.streamKind === "runtime"
      ? await this.lease.database.all<EventChunkRow>("select chunk_id, run_id as stream_id, first_sequence, last_sequence, event_count, byte_count, object_id, sha256, closed, created_at_ms, first_event_at_ms, last_event_at_ms from runtime_event_chunks where run_id = ? and last_sequence > ? order by first_sequence limit ?", [requiredId(input.streamId, "stream"), afterSequence, 32])
      : await this.lease.database.all<EventChunkRow>("select chunk_id, recording_id as stream_id, first_sequence, last_sequence, event_count, byte_count, object_id, sha256, closed, created_at_ms, first_event_at_ms, last_event_at_ms from recording_event_chunks where recording_id = ? and last_sequence > ? order by first_sequence limit ?", [requiredId(input.streamId, "stream"), afterSequence, 32]);
    return this.eventsFromRows(input.streamKind, rows, (event) => event.sequence > afterSequence, limit);
  }

  async readEventsByTime(input: { streamKind: AutomationStudioEventStreamKind; streamId: string; fromTimeMs: number; cursor?: string | null; limit?: number }): Promise<AutomationStudioEventCursorPage> {
    const limit = clampLimit(input.limit);
    const cursor = decodeCursor<{ timeMs: number; sequence: number }>(input.cursor);
    const fromTimeMs = Math.trunc(cursor?.timeMs ?? input.fromTimeMs);
    const afterSequence = Math.max(0, Math.trunc(cursor?.sequence ?? 0));
    const rows = input.streamKind === "runtime"
      ? await this.lease.database.all<EventChunkRow>(`select chunk_id, run_id as stream_id, first_sequence, last_sequence, event_count, byte_count, object_id, sha256, closed, created_at_ms, first_event_at_ms, last_event_at_ms
        from runtime_event_chunks where run_id = ? and last_event_at_ms is not null and last_event_at_ms >= ? order by first_event_at_ms, first_sequence limit ?`, [requiredId(input.streamId, "stream"), fromTimeMs, 32])
      : await this.lease.database.all<EventChunkRow>(`select chunk_id, recording_id as stream_id, first_sequence, last_sequence, event_count, byte_count, object_id, sha256, closed, created_at_ms, first_event_at_ms, last_event_at_ms
        from recording_event_chunks where recording_id = ? and last_event_at_ms is not null and last_event_at_ms >= ? order by first_event_at_ms, first_sequence limit ?`, [requiredId(input.streamId, "stream"), fromTimeMs, 32]);
    return this.eventsFromRows(input.streamKind, rows, (event) => {
      const timeMs = eventTimestampMs(event);
      return timeMs !== null && (timeMs > fromTimeMs || timeMs === fromTimeMs && event.sequence > afterSequence);
    }, limit, (event) => encodeCursor({ timeMs: eventTimestampMs(event) ?? fromTimeMs, sequence: event.sequence }));
  }

  async readChunk(input: { streamKind: AutomationStudioEventStreamKind; chunkId: string }): Promise<{ record: AutomationStudioEventChunkRecord; document: AutomationStudioEventChunkDocument }> {
    const record = await this.getChunk(input);
    if (!record) throw new Error(`Automation Studio event chunk ${input.chunkId} was not found.`);
    const asset = await this.content.readBytesBySha256(record.sha256);
    if (createHash("sha256").update(asset.content).digest("hex") !== record.sha256) throw new Error(`Automation Studio event chunk checksum mismatch: ${input.chunkId}`);
    const document = JSON.parse(asset.content.toString("utf8")) as AutomationStudioEventChunkDocument;
    if (document.schemaVersion !== "automation-studio.event-chunk.v1" || document.firstSequence !== record.firstSequence || document.lastSequence !== record.lastSequence) throw new Error(`Automation Studio event chunk manifest mismatch: ${input.chunkId}`);
    return { record, document };
  }

  async getChunk(input: { streamKind: AutomationStudioEventStreamKind; chunkId: string }): Promise<AutomationStudioEventChunkRecord | null> {
    const row = input.streamKind === "runtime"
      ? await this.lease.database.get<EventChunkRow>("select chunk_id, run_id as stream_id, first_sequence, last_sequence, event_count, byte_count, object_id, sha256, closed, created_at_ms from runtime_event_chunks where chunk_id = ?", [requiredId(input.chunkId, "chunk")])
      : await this.lease.database.get<EventChunkRow>("select chunk_id, recording_id as stream_id, first_sequence, last_sequence, event_count, byte_count, object_id, sha256, closed, created_at_ms from recording_event_chunks where chunk_id = ?", [requiredId(input.chunkId, "chunk")]);
    return row ? chunkFromRow(row, input.streamKind) : null;
  }

  private async eventsFromRows(streamKind: AutomationStudioEventStreamKind, rows: EventChunkRow[], include: (event: AutomationStudioChunkEvent) => boolean, limit: number, cursorForEvent: (event: AutomationStudioChunkEvent) => string = (event) => String(event.sequence)): Promise<AutomationStudioEventCursorPage> {
    const events: AutomationStudioChunkEvent[] = [];
    for (const row of rows) {
      const { document } = await this.readChunk({ streamKind, chunkId: row.chunk_id });
      for (const event of document.events) {
        if (!include(event)) continue;
        events.push(event);
        if (events.length > limit) break;
      }
      if (events.length > limit) break;
    }
    const pageEvents = events.slice(0, limit);
    const last = pageEvents.at(-1);
    return { events: pageEvents, hasMore: events.length > limit, nextCursor: events.length > limit && last ? cursorForEvent(last) : null };
  }
}

type EventChunkRow = { chunk_id: string; stream_id: string; first_sequence: number; last_sequence: number; event_count: number; byte_count: number; object_id: string; sha256: string; closed: number; created_at_ms: number; first_event_at_ms: number | null; last_event_at_ms: number | null };

function chunkFromRow(row: EventChunkRow, streamKind: AutomationStudioEventStreamKind): AutomationStudioEventChunkRecord { return { chunkId: row.chunk_id, streamKind, streamId: row.stream_id, firstSequence: row.first_sequence, lastSequence: row.last_sequence, eventCount: row.event_count, byteCount: row.byte_count, objectId: row.object_id, sha256: row.sha256, closed: row.closed === 1, createdAt: row.created_at_ms, firstEventAt: row.first_event_at_ms, lastEventAt: row.last_event_at_ms }; }
function validateEvents(events: readonly AutomationStudioChunkEvent[], maxEvents: number): AutomationStudioChunkEvent[] { if (!events.length) throw new Error("Automation Studio event chunks must contain at least one event."); if (events.length > Math.max(1, Math.trunc(maxEvents))) throw new Error("Automation Studio event chunk contains too many events."); const copied = events.map((event) => ({ ...event, sequence: Math.trunc(event.sequence) })); for (let index = 0; index < copied.length; index += 1) { const sequence = copied[index]!.sequence; if (sequence < 1) throw new Error("Automation Studio event sequence must be positive."); if (index > 0 && sequence !== copied[index - 1]!.sequence + 1) throw new Error("Automation Studio event chunk sequences must be contiguous."); } return copied; }
function requiredId(value: string, kind: string): string { const id = value.trim(); if (!id || id.length > 200 || !/^[A-Za-z0-9._:-]+$/.test(id)) throw new Error(`Invalid ${kind} ID.`); return id; }
function clampLimit(value?: number): number { return Math.max(1, Math.min(500, Math.trunc(value ?? 100))); }
function eventTimestampMs(event: AutomationStudioChunkEvent): number | null { const value = event.timestampMs ?? event.timeMs ?? event.timestamp; return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : null; }
function eventTimeRange(events: readonly AutomationStudioChunkEvent[]): { firstEventAt: number | null; lastEventAt: number | null } { const values = events.map(eventTimestampMs).filter((value): value is number => value !== null); return values.length ? { firstEventAt: Math.min(...values), lastEventAt: Math.max(...values) } : { firstEventAt: null, lastEventAt: null }; }
function encodeCursor(value: unknown): string { return Buffer.from(JSON.stringify(value)).toString("base64url"); }
function decodeCursor<T>(value: string | null | undefined): T | null { if (!value) return null; try { return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T; } catch { throw new Error("Invalid Automation Studio event cursor."); } }
