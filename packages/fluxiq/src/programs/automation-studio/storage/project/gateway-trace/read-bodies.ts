// Reassembles chunked event bodies exactly as written. Each distinct chunk is
// fetched, opened (when sealed) and verified once per call, however many of the
// events use it. A chunk that is not there makes its event unreadable and
// throws "not held"; a sealed chunk that cannot be opened throws; a body is
// never returned shortened or with a piece left out.
import type { AutomationStudioSqlExecutor } from "../database.ts";
import { openGatewayTraceChunk } from "./open-chunk.ts";
import type { GatewayTraceChunkSealing, GatewayTraceChunkedBodyRef } from "./types.ts";

const DIGEST_BYTES = 32;
const DIGESTS_PER_STATEMENT = 400;

type ChunkRow = { digest: Buffer; encoding: string; byte_length: number; stored: Buffer; encryption: string | null };

/** The bodies' JSON texts, in the order given. */
export async function readGatewayTraceChunkedBodies(
  sql: AutomationStudioSqlExecutor,
  sealing: GatewayTraceChunkSealing,
  bodies: readonly GatewayTraceChunkedBodyRef[]
): Promise<readonly string[]> {
  const lists = bodies.map((body) => digestList(body));
  const rows = await chunkRows(sql, lists.flat());
  const opened = new Map<string, Buffer>();
  const texts: string[] = [];
  for (const [index, body] of bodies.entries()) {
    const pieces: Buffer[] = [];
    for (const digest of lists[index]!) pieces.push(await openOnce({ sealing, rows, opened, digest, where: body.where }));
    const whole = Buffer.concat(pieces);
    if (whole.byteLength !== body.byteLength) {
      throw new Error(`event ${body.where} is not held whole: its chunks hold ${whole.byteLength} bytes, not ${body.byteLength}`);
    }
    texts.push(whole.toString("utf8"));
  }
  return texts;
}

async function openOnce(input: {
  sealing: GatewayTraceChunkSealing;
  rows: ReadonlyMap<string, ChunkRow>;
  opened: Map<string, Buffer>;
  digest: Buffer;
  where: string;
}): Promise<Buffer> {
  const name = input.digest.toString("hex");
  const known = input.opened.get(name);
  if (known !== undefined) return known;
  const row = input.rows.get(name);
  if (row === undefined) throw new Error(`event ${input.where} is not held: its chunk ${name} is missing`);
  const bytes = await openGatewayTraceChunk(input.sealing, {
    digest: input.digest,
    encoding: row.encoding,
    byteLength: row.byte_length,
    stored: row.stored,
    encryption: row.encryption
  });
  input.opened.set(name, bytes);
  return bytes;
}

function digestList(body: GatewayTraceChunkedBodyRef): Buffer[] {
  if (body.digests.byteLength === 0 || body.digests.byteLength % DIGEST_BYTES !== 0) {
    throw new Error(`event ${body.where} has a damaged chunk list of ${body.digests.byteLength} bytes`);
  }
  const list: Buffer[] = [];
  for (let offset = 0; offset < body.digests.byteLength; offset += DIGEST_BYTES) list.push(body.digests.subarray(offset, offset + DIGEST_BYTES));
  return list;
}

async function chunkRows(sql: AutomationStudioSqlExecutor, digests: readonly Buffer[]): Promise<Map<string, ChunkRow>> {
  const distinct = new Map<string, Buffer>();
  for (const digest of digests) distinct.set(digest.toString("hex"), digest);
  const wanted = [...distinct.values()];
  const rows = new Map<string, ChunkRow>();
  for (let offset = 0; offset < wanted.length; offset += DIGESTS_PER_STATEMENT) {
    const slice = wanted.slice(offset, offset + DIGESTS_PER_STATEMENT);
    const marks = slice.map(() => "?").join(", ");
    const found = await sql.all<ChunkRow>(
      `select digest, encoding, byte_length, stored, encryption from client_gateway_trace_chunks where digest in (${marks})`,
      slice
    );
    for (const row of found) rows.set(row.digest.toString("hex"), row);
  }
  return rows;
}
