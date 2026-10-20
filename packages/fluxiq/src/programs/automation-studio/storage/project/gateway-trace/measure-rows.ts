// Aggregate SELECTs behind the store's trace measures (lane T P3): lengths
// and counts only, never a body, a digest or a payload.
import type { AutomationStudioSqlExecutor } from "../database.ts";
import type { AutomationStudioGatewayTraceChunkSetMeasure } from "./chunk-set-measure.ts";
import type { AutomationStudioGatewayTraceMeasure } from "./measure.ts";

type EventCounts = {
  events: number;
  inlineEvents: number;
  inlineBytes: number;
  chunkedEvents: number;
  chunkedLogicalBytes: number;
  digestListBytes: number;
  objectEvents: number;
  objectBytes: number;
};
type ChunkCounts = { chunks: number; chunkRawBytes: number; storedChunkBytes: number; sharedChunks: number; sharedStoredChunkBytes: number };

const EVENT_SQL = `select count(*) as events,
    count(e.event_json) as inlineEvents,
    coalesce(sum(length(cast(e.event_json as blob))), 0) as inlineBytes,
    count(e.event_chunk_digests) as chunkedEvents,
    coalesce(sum(e.event_byte_length), 0) as chunkedLogicalBytes,
    coalesce(sum(length(e.event_chunk_digests)), 0) as digestListBytes,
    count(e.event_object_id) as objectEvents,
    coalesce(sum(o.byte_count), 0) as objectBytes
  from client_gateway_trace_events e
  left join objects o on o.object_id = e.event_object_id
  where e.trace_id = ?`;

const CHUNK_SQL = `select count(*) as chunks,
    coalesce(sum(c.byte_length), 0) as chunkRawBytes,
    coalesce(sum(length(c.stored)), 0) as storedChunkBytes,
    coalesce(sum(case when exists (select 1 from client_gateway_trace_chunk_uses other where other.digest = u.digest and other.trace_id <> u.trace_id) then 1 else 0 end), 0) as sharedChunks,
    coalesce(sum(case when exists (select 1 from client_gateway_trace_chunk_uses other where other.digest = u.digest and other.trace_id <> u.trace_id) then length(c.stored) else 0 end), 0) as sharedStoredChunkBytes
  from client_gateway_trace_chunk_uses u
  join client_gateway_trace_chunks c on c.digest = u.digest
  where u.trace_id = ?`;

/** One trace's event and chunk figures; the store adds its held artifacts. */
export async function measureGatewayTraceRows(
  sql: AutomationStudioSqlExecutor,
  traceId: string
): Promise<Omit<AutomationStudioGatewayTraceMeasure, "traceId" | "artifacts" | "artifactBytes" | "logicalEventBytes">> {
  const events = await sql.get<EventCounts>(EVENT_SQL, [traceId]);
  const chunks = await sql.get<ChunkCounts>(CHUNK_SQL, [traceId]);
  if (events === undefined || chunks === undefined) throw new Error(`the stored size of trace ${traceId} could not be read`);
  return {
    events: Number(events.events),
    inlineEvents: Number(events.inlineEvents),
    inlineBytes: Number(events.inlineBytes),
    chunkedEvents: Number(events.chunkedEvents),
    chunkedLogicalBytes: Number(events.chunkedLogicalBytes),
    digestListBytes: Number(events.digestListBytes),
    objectEvents: Number(events.objectEvents),
    objectBytes: Number(events.objectBytes),
    chunks: Number(chunks.chunks),
    chunkRawBytes: Number(chunks.chunkRawBytes),
    storedChunkBytes: Number(chunks.storedChunkBytes),
    sharedChunks: Number(chunks.sharedChunks),
    sharedStoredChunkBytes: Number(chunks.sharedStoredChunkBytes)
  };
}

/** The distinct chunks a set of traces uses; an empty set uses none. */
export async function measureGatewayTraceChunkSetRows(
  sql: AutomationStudioSqlExecutor,
  traceIds: readonly string[]
): Promise<AutomationStudioGatewayTraceChunkSetMeasure> {
  const distinct = [...new Set(traceIds)];
  if (distinct.length === 0) return Object.freeze({ traces: 0, chunks: 0, storedChunkBytes: 0 });
  const marks = distinct.map(() => "?").join(", ");
  const row = await sql.get<{ chunks: number; storedChunkBytes: number }>(
    `select count(*) as chunks, coalesce(sum(length(stored)), 0) as storedChunkBytes from client_gateway_trace_chunks
      where digest in (select digest from client_gateway_trace_chunk_uses where trace_id in (${marks}))`,
    distinct
  );
  if (row === undefined) throw new Error("the stored size of the traces' chunks could not be read");
  return Object.freeze({ traces: distinct.length, chunks: Number(row.chunks), storedChunkBytes: Number(row.storedChunkBytes) });
}
