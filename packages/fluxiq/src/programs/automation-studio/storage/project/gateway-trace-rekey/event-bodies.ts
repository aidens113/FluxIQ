// Reads the bodies of event rows in an old form, for the event pass to re-cut:
// a chunked body through the trace store's own reader in the row's form (the
// chunks a batch shares are opened once; when one body fails, each row is read
// alone, so one damaged chunk leaves only its own events behind), an inline
// body as it is, a 0030 object body through the content store. Every body must
// parse as JSON naming this row's trace and sequence. A row that fails any of
// it is named with a reason and no cause: a reader's message may carry an old
// plain digest, and a JSON error may quote the body.
import { readGatewayTraceChunkedBodies } from "../gateway-trace-chunk-rows/index.ts";
import type { GatewayTraceRekeyContext } from "./context.ts";

/** An event row as the event pass selects it. */
export type GatewayTraceOldEventRow = {
  readonly trace_id: string;
  readonly sequence: number;
  readonly event_json: string | null;
  readonly event_object_id: string | null;
  readonly event_chunk_digests: Buffer | null;
  readonly event_chunk_address_key_id: string | null;
  readonly event_byte_length: number | null;
};

/** A row's verified JSON text, or why it stays in its old form. */
export type GatewayTraceOldEventBody = { readonly text: string } | { readonly skipped: string };

type Read = { text: string } | { skipped: string };

/** A chunked body to read, as the trace store's reader takes it. */
type GatewayTraceChunkedBodyRef = Parameters<typeof readGatewayTraceChunkedBodies>[2][number];

export async function readOldGatewayTraceEventBodies(context: GatewayTraceRekeyContext, rows: readonly GatewayTraceOldEventRow[]): Promise<GatewayTraceOldEventBody[]> {
  const chunked = await chunkedTexts(context, rows);
  const bodies: GatewayTraceOldEventBody[] = [];
  for (const row of rows) {
    const read = row.event_json !== null
      ? { text: row.event_json }
      : row.event_object_id !== null
        ? await objectText(context, row.event_object_id)
        : chunked.get(where(row)) ?? { skipped: "it has no body" };
    bodies.push("text" in read ? verified(row, read.text) : read);
  }
  return bodies;
}

async function chunkedTexts(context: GatewayTraceRekeyContext, rows: readonly GatewayTraceOldEventRow[]): Promise<Map<string, Read>> {
  const texts = new Map<string, Read>();
  const refs: GatewayTraceChunkedBodyRef[] = [];
  for (const row of rows) {
    if (row.event_json !== null || row.event_object_id !== null || row.event_chunk_digests === null) continue;
    if (row.event_byte_length === null) texts.set(where(row), { skipped: "it has chunks but no byte length" });
    else refs.push({ where: where(row), digests: row.event_chunk_digests, addressKeyId: row.event_chunk_address_key_id, byteLength: row.event_byte_length });
  }
  const together = refs.length > 1 ? await readChunked(context, refs) : { failed: true as const };
  for (const [index, ref] of refs.entries()) {
    if ("texts" in together) {
      texts.set(ref.where, { text: together.texts[index]! });
      continue;
    }
    const alone = await readChunked(context, [ref]);
    texts.set(ref.where, "texts" in alone ? { text: alone.texts[0]! } : { skipped: "its chunks cannot be read or verified" });
  }
  return texts;
}

/** The bodies read together, or that one of them failed: a chunk missing, damaged, or not verifiable in the row's form. */
async function readChunked(context: GatewayTraceRekeyContext, refs: readonly GatewayTraceChunkedBodyRef[]): Promise<{ texts: readonly string[] } | { failed: true }> {
  try {
    return { texts: await readGatewayTraceChunkedBodies(context.database, context.sealing, refs) };
  } catch {
    return { failed: true };
  }
}

async function objectText(context: GatewayTraceRekeyContext, objectId: string): Promise<Read> {
  try {
    const asset = await context.content.readBytesByObjectId(objectId);
    return { text: asset.content.toString("utf8") };
  } catch {
    return { skipped: "its content object cannot be read" };
  }
}

function verified(row: GatewayTraceOldEventRow, text: string): GatewayTraceOldEventBody {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { skipped: "its body is not JSON" };
  }
  if (typeof parsed !== "object" || parsed === null) return { skipped: "its body is not an event" };
  const event = parsed as { traceId?: unknown; sequence?: unknown };
  if (event.traceId !== row.trace_id || event.sequence !== row.sequence) return { skipped: "its body names another event" };
  return { text };
}

function where(row: GatewayTraceOldEventRow): string {
  return `${row.trace_id}#${row.sequence}`;
}
