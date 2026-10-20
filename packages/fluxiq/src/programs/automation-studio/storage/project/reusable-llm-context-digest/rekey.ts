// Rekeying reusable LLM context digests at a protected open (t745 design note
// D5). Rows whose digest is plain (key id null) or made under a key that is no
// longer current are walked in record-id order, a batch at a time: each row's
// projection is read through the content store and checked against its old
// digest, and the keyed digest is written by an update guarded on the old
// digest and key id, so a row changed in between is left alone. The cursor
// always moves past every row it read, so a row that cannot be read or does not
// verify is counted and skipped, never thrown and never visited twice in one
// pass; it stays in its old form and still fails when read, as before. A batch
// that rewrote any digest also requests a scrub of the database file in the
// same transaction (t745 u5), which the store honours at the end of its open.
import { requestContentAddressScrub } from "../content-address/index.ts";
import type { AutomationStudioContentAddressKeyring } from "../content-address/index.ts";
import type { AutomationStudioProjectDatabase } from "../database.ts";
import { keyedReusableLlmContextDigest, reusableLlmContextDigestMatches } from "./digest.ts";

export type ReusableLlmContextDigestRekeyOptions = {
  /** Rows read per batch, 1 to 500 (100 by default). */
  batchSize?: number;
  /** Stop after this many batches; the next open resumes from the rows still stale. */
  maxBatches?: number;
};

export type ReusableLlmContextDigestRekeyResult = {
  rekeyed: number;
  skipped: number;
  batches: number;
  complete: boolean;
};

type StaleRow = {
  recordId: string;
  promptObjectId: string;
  byteCount: number;
  digest: string;
  keyId: string | null;
};

type Rewrite = { row: StaleRow; digest: string; keyId: string };

/** What one stale row comes to: a rewrite, or the reason it is left in its old form. */
type RowOutcome = { rewrite: Rewrite } | { skipped: "unreadable" | "mismatch" };

type Projection = { content: Buffer } | { skipped: "unreadable" };

type ContentReader = { readBytesByObjectId(objectId: string): Promise<{ content: Buffer }> };

const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 500;

export async function rekeyReusableLlmContextDigests(input: {
  database: AutomationStudioProjectDatabase;
  content: ContentReader;
  keyring: AutomationStudioContentAddressKeyring;
  options?: ReusableLlmContextDigestRekeyOptions;
}): Promise<ReusableLlmContextDigestRekeyResult> {
  const batchSize = boundedInteger(input.options?.batchSize ?? DEFAULT_BATCH_SIZE, 1, MAX_BATCH_SIZE, "batchSize");
  const maxBatches = input.options?.maxBatches === undefined ? Number.POSITIVE_INFINITY : boundedInteger(input.options.maxBatches, 1, Number.MAX_SAFE_INTEGER, "maxBatches");
  const result: ReusableLlmContextDigestRekeyResult = { rekeyed: 0, skipped: 0, batches: 0, complete: false };
  let cursor = "";
  while (result.batches < maxBatches) {
    const rows = await staleRows(input.database, input.keyring.currentKeyId, cursor, batchSize);
    if (!rows.length) {
      result.complete = true;
      return result;
    }
    result.batches += 1;
    cursor = rows[rows.length - 1]!.recordId;
    const rewrites: Rewrite[] = [];
    for (const row of rows) {
      const outcome = await rowOutcome(input, row);
      if ("rewrite" in outcome) rewrites.push(outcome.rewrite);
      else result.skipped += 1;
    }
    const written = await writeBatch(input.database, rewrites);
    result.rekeyed += written;
    result.skipped += rewrites.length - written;
    if (rows.length < batchSize) {
      result.complete = true;
      return result;
    }
  }
  return result;
}

/** `< ? or > ?` rather than `<> ?`, so the partial index on the non-null key ids serves the rows under a retired key. */
async function staleRows(database: AutomationStudioProjectDatabase, currentKeyId: string, cursor: string, limit: number): Promise<StaleRow[]> {
  return database.all<StaleRow>(
    `select record_id as recordId, prompt_object_id as promptObjectId, byte_count as byteCount,
       content_digest as digest, content_digest_key_id as keyId
     from reusable_llm_contexts
     where record_id > ? and (content_digest_key_id is null or content_digest_key_id < ? or content_digest_key_id > ?)
     order by record_id
     limit ?`,
    [cursor, currentKeyId, currentKeyId, limit]
  );
}

async function rowOutcome(
  input: { content: ContentReader; keyring: AutomationStudioContentAddressKeyring },
  row: StaleRow
): Promise<RowOutcome> {
  const projection = await readProjection(input.content, row.promptObjectId);
  if ("skipped" in projection) return projection;
  const content = projection.content;
  if (content.byteLength !== row.byteCount) return { skipped: "mismatch" };
  const verified = reusableLlmContextDigestMatches({ keyring: input.keyring, content, digest: row.digest, keyId: row.keyId });
  if (!verified) return { skipped: "mismatch" };
  const keyed = keyedReusableLlmContextDigest(input.keyring, content);
  return { rewrite: { row, digest: keyed.digest, keyId: keyed.keyId } };
}

/**
 * A projection that cannot be read (a missing or damaged object, a key the
 * protection no longer resolves) is a skipped row, not a failed open: its own
 * read still fails later, exactly as it would have. The cause is not kept, so
 * no provider message reaches a result.
 */
async function readProjection(content: ContentReader, objectId: string): Promise<Projection> {
  try {
    const asset = await content.readBytesByObjectId(objectId);
    return { content: asset.content };
  } catch {
    return { skipped: "unreadable" };
  }
}

async function writeBatch(database: AutomationStudioProjectDatabase, rewrites: readonly Rewrite[]): Promise<number> {
  if (!rewrites.length) return 0;
  return database.transaction(async (sql) => {
    let written = 0;
    for (const rewrite of rewrites) {
      const outcome = await sql.run(
        `update reusable_llm_contexts set content_digest = ?, content_digest_key_id = ?
         where record_id = ? and content_digest = ? and content_digest_key_id is ?`,
        [rewrite.digest, rewrite.keyId, rewrite.row.recordId, rewrite.row.digest, rewrite.row.keyId]
      );
      written += outcome.changes;
    }
    if (written > 0) await requestContentAddressScrub(sql, Date.now());
    return written;
  });
}

function boundedInteger(value: number, min: number, max: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`Reusable LLM context digest rekey ${label} must be an integer from ${min} to ${max}.`);
  return value;
}
