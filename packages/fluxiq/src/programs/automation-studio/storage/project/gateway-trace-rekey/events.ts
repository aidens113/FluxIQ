// The event pass (t745 design note D4 step 3): every event row whose body is
// in an old form (chunked under no key or a retired key, inline JSON, or a 0030
// content object) is read, verified (`event-bodies.ts`) and re-cut under the
// current key as a protected append would cut it. Each batch is one
// transaction: an update guarded on the row's old body columns (a row changed
// in between is left alone), then the keyed chunks of the rows that changed.
// A converted object row drops its trace's event reference to the object when
// no event row of the trace still names it, and the object is released in the
// same transaction when nothing else references it (its row deleted, its file
// pending removal), so a crash after commit leaves the file to the next
// content store open; the file is removed once the batch has committed. A
// batch that converted anything also requests a scrub of the database file.
//
// Pages are keyset by (trace, sequence), so a row that cannot be read or
// verified is passed over and counted, never retried in the same run and never
// written: it keeps its old form and still fails when read. Old-form chunks are
// not touched here; the cleanup that follows deletes those no old-form event
// names (`chunk-cleanup.ts`).
import { requestContentAddressScrub } from "../content-address/index.ts";
import type { AutomationStudioSqlExecutor } from "../database.ts";
import { prepareGatewayTraceEventBody } from "../gateway-trace/prepare-body.ts";
import { writeGatewayTraceChunks } from "../gateway-trace/write-chunks.ts";
import type { GatewayTraceRekeyContext, GatewayTraceRekeySkip } from "./context.ts";
import { readOldGatewayTraceEventBodies } from "./event-bodies.ts";
import type { GatewayTraceOldEventRow } from "./event-bodies.ts";
import { AutomationStudioProjectObjectRepository } from "../object-repository.ts";
import { gatewayTraceOldFormFilters } from "./old-forms.ts";
import { drainReleasedGatewayTraceObjects } from "./release-object.ts";

const OWNER_KIND = "client_gateway_trace";
const ROW_COLUMNS = "trace_id, sequence, event_json, event_object_id, event_chunk_digests, event_chunk_address_key_id, event_byte_length";

export type GatewayTraceEventRekeyResult = {
  /** Rows now chunked under the current key. */
  converted: number;
  /** Rows left in their old form: unreadable, unverified, or changed by another writer in between. */
  skipped: number;
  /** Legacy event objects removed after their last reference went. */
  objectsRemoved: number;
};

/** A chunk as the trace store writes it. */
type GatewayTraceChunk = Parameters<typeof writeGatewayTraceChunks>[3][number];

type Conversion = { row: GatewayTraceOldEventRow; digests: Buffer; byteLength: number; chunks: readonly GatewayTraceChunk[] };

export async function rekeyGatewayTraceEvents(context: GatewayTraceRekeyContext, skips: GatewayTraceRekeySkip[]): Promise<GatewayTraceEventRekeyResult> {
  const result: GatewayTraceEventRekeyResult = { converted: 0, skipped: 0, objectsRemoved: 0 };
  for (const filter of gatewayTraceOldFormFilters(context, "event_chunk_address_key_id")) {
    let cursor: readonly [string, number] = ["", 0];
    for (;;) {
      const rows = await context.database.all<GatewayTraceOldEventRow>(
        `select ${ROW_COLUMNS} from client_gateway_trace_events
         where ${filter.where} and (trace_id, sequence) > (?, ?)
         order by trace_id, sequence limit ?`,
        [...filter.params, cursor[0], cursor[1], context.budget.batchSize]
      );
      if (rows.length === 0) break;
      if (!context.budget.take()) return result;
      const last = rows[rows.length - 1]!;
      cursor = [last.trace_id, last.sequence];
      await rekeyBatch(context, rows, result, skips);
      if (rows.length < context.budget.batchSize) break;
    }
  }
  return result;
}

async function rekeyBatch(context: GatewayTraceRekeyContext, rows: readonly GatewayTraceOldEventRow[], result: GatewayTraceEventRekeyResult, skips: GatewayTraceRekeySkip[]): Promise<void> {
  const bodies = await readOldGatewayTraceEventBodies(context, rows);
  const conversions: Conversion[] = [];
  for (const [index, row] of rows.entries()) {
    const body = bodies[index]!;
    if ("skipped" in body) {
      result.skipped += 1;
      skips.push({ kind: "event", where: `${row.trace_id}#${row.sequence}`, reason: body.skipped });
      continue;
    }
    const prepared = prepareGatewayTraceEventBody({ json: body.text, inlineAllowed: false, keyring: context.sealing.keyring });
    if (prepared.kind !== "chunked") throw new Error(`event ${row.trace_id}#${row.sequence} was not cut into chunks`);
    conversions.push({ row, digests: prepared.digests, byteLength: prepared.byteLength, chunks: prepared.chunks });
  }
  if (conversions.length === 0) return;
  const written = await context.database.transaction((sql) => writeBatch(sql, context, conversions));
  result.converted += written.changed.length;
  for (const conversion of conversions) {
    if (written.changed.includes(conversion)) continue;
    result.skipped += 1;
    skips.push({ kind: "event", where: `${conversion.row.trace_id}#${conversion.row.sequence}`, reason: "another writer changed it" });
  }
  result.objectsRemoved += await drainReleasedGatewayTraceObjects(context, written.released, "a legacy event object", skips);
}

async function writeBatch(sql: AutomationStudioSqlExecutor, context: GatewayTraceRekeyContext, conversions: readonly Conversion[]): Promise<{ changed: Conversion[]; released: string[] }> {
  const keyId = context.sealing.keyring.currentKeyId;
  const now = Date.now();
  const changed: Conversion[] = [];
  for (const conversion of conversions) {
    const { row } = conversion;
    const outcome = await sql.run(
      `update client_gateway_trace_events
         set event_json = null, event_object_id = null, event_chunk_digests = ?, event_chunk_address_key_id = ?, event_byte_length = ?
       where trace_id = ? and sequence = ?
         and event_json is ? and event_object_id is ? and event_chunk_digests is ? and event_chunk_address_key_id is ? and event_byte_length is ?`,
      [conversion.digests, keyId, conversion.byteLength, row.trace_id, row.sequence, row.event_json, row.event_object_id, row.event_chunk_digests, row.event_chunk_address_key_id, row.event_byte_length]
    );
    if (outcome.changes === 1) changed.push(conversion);
  }
  const chunksByTrace = new Map<string, GatewayTraceChunk[]>();
  for (const conversion of changed) {
    const list = chunksByTrace.get(conversion.row.trace_id) ?? [];
    list.push(...conversion.chunks);
    chunksByTrace.set(conversion.row.trace_id, list);
  }
  for (const [traceId, chunks] of chunksByTrace) await writeGatewayTraceChunks(sql, context.sealing, traceId, chunks);
  const released: string[] = [];
  for (const conversion of changed) {
    const { trace_id: traceId, event_object_id: objectId } = conversion.row;
    if (objectId === null) continue;
    await sql.run(
      `delete from object_references
       where owner_kind = ? and owner_id = ? and purpose = 'event' and object_id = ?
         and not exists (select 1 from client_gateway_trace_events where trace_id = ? and event_object_id = ?)`,
      [OWNER_KIND, traceId, objectId, traceId, objectId]
    );
    if (released.includes(objectId)) continue;
    if (await AutomationStudioProjectObjectRepository.releaseObjectIfUnreferenced(sql, objectId, now)) released.push(objectId);
  }
  if (changed.length > 0) await requestContentAddressScrub(sql, now);
  return { changed, released };
}
