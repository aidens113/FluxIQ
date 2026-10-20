// Converts what a protected project already holds of client gateway traces to
// the keyed forms (t745 design note D4 step 3, D5), when a protected trace store
// opens, after the keyring and before the store seals leftover unsealed chunks.
// In order: event bodies (chunked under no key or a retired key, inline JSON,
// 0030 objects) are re-cut into keyed sealed chunks; old-form chunks and uses no
// unconverted event names are deleted; artifact digests are keyed, unsealed
// artifact objects stored sealed; plaintext manifests are sealed. Each pass runs
// in batch transactions over keyset pages and never throws on a damaged row: the
// row stays in its old form, still fails when read, and is counted. A failure of
// the database or of the protection itself does throw, and fails the open; every
// committed batch stays, and the next open resumes from the rows still stale.
//
// Every batch that converts or deletes an old form requests a scrub in its own
// transaction (t745 u5), and every run ends by honouring a scrub request:
// VACUUM, then a truncate checkpoint (`../content-address/scrub-database.ts`).
// `secure_delete` zeroes a deleted cell, but a page that B-tree balancing
// rebuilt keeps stale cell bytes in its unallocated gap (the u3b probe found an
// old chunk digest there with the store closed); only rebuilding every page
// removes them, and the truncate empties the WAL of the old page images. The
// request outlives a crash, a failed or busy VACUUM and an interrupted run, so
// a later protected open still scrubs even when nothing is left to convert;
// with no request the scrub is one read. Its status is reported, never thrown.
import type { AutomationStudioProjectDatabase } from "../database.ts";
import { scrubProjectDatabaseIfRequested } from "../content-address/index.ts";
import { protectGatewayTraceChunks } from "../gateway-trace/protect-chunks.ts";
import type { ContentAddressScrubStatus } from "../content-address/index.ts";
import { rekeyGatewayTraceArtifacts } from "./artifacts.ts";
import type { GatewayTraceArtifactRekeyResult } from "./artifacts.ts";
import { GatewayTraceRekeyBudget } from "./budget.ts";
import { deleteOldFormGatewayTraceChunks } from "./chunk-cleanup.ts";
import type { GatewayTraceChunkCleanupResult } from "./chunk-cleanup.ts";
import type { GatewayTraceRekeyContent, GatewayTraceRekeySealing, GatewayTraceRekeySkip } from "./context.ts";
import { rekeyGatewayTraceEvents } from "./events.ts";
import type { GatewayTraceEventRekeyResult } from "./events.ts";
import { sealGatewayTraceManifests } from "./manifests.ts";
import type { GatewayTraceManifestSealResult } from "./manifests.ts";

export type GatewayTraceRekeyOptions = {
  /** Rows read per batch, 1 to 500 (50 by default). */
  batchSize?: number;
  /** Stop after this many batches of all passes together; the next protected open resumes. */
  maxBatches?: number;
};

export type GatewayTraceRekeyResult = {
  /** The key every converted row is now under. */
  readonly keyId: string;
  readonly events: Readonly<GatewayTraceEventRekeyResult>;
  readonly chunks: Readonly<GatewayTraceChunkCleanupResult>;
  readonly artifacts: Readonly<GatewayTraceArtifactRekeyResult>;
  readonly manifests: Readonly<GatewayTraceManifestSealResult>;
  /** Every row left in its old form, and every released object whose file could not be removed. */
  readonly skipped: readonly GatewayTraceRekeySkip[];
  readonly batches: number;
  /** False when `maxBatches` stopped the run before every pass reached its last row. */
  readonly complete: boolean;
  /** Chunks still unsealed after the passes, sealed in place by the last step. */
  readonly leftoverChunksSealed: number;
  /** What honouring a scrub request at the end of this run did. */
  readonly scrub: ContentAddressScrubStatus;
};

export async function rekeyGatewayTraceStore(input: {
  database: AutomationStudioProjectDatabase;
  sealing: GatewayTraceRekeySealing;
  content: GatewayTraceRekeyContent;
  options?: GatewayTraceRekeyOptions;
}): Promise<GatewayTraceRekeyResult> {
  const budget = new GatewayTraceRekeyBudget(input.options);
  const context = { database: input.database, sealing: input.sealing, content: input.content, budget, retiredKeys: await holdsRetiredKeys(input.database, input.sealing.keyring.currentKeyId) };
  const skipped: GatewayTraceRekeySkip[] = [];
  const events = await rekeyGatewayTraceEvents(context, skipped);
  const chunks = budget.stopped ? { chunksDeleted: 0, usesDeleted: 0 } : await deleteOldFormGatewayTraceChunks(context);
  const artifacts = budget.stopped ? { rekeyed: 0, sealed: 0, skipped: 0, objectsRemoved: 0 } : await rekeyGatewayTraceArtifacts(context, skipped);
  const manifests = budget.stopped ? { sealed: 0, skipped: 0 } : await sealGatewayTraceManifests(context, skipped);
  // Last, whatever chunk is still unsealed (one only a damaged event names, or one a run stopped short of) is
  // sealed in place, as every protected open did before t745; its batches request a scrub, honoured just below.
  const leftoverChunksSealed = await protectGatewayTraceChunks(input.database, input.sealing);
  const scrub = await scrubProjectDatabaseIfRequested(input.database);
  return Object.freeze({
    keyId: input.sealing.keyring.currentKeyId,
    events,
    chunks,
    artifacts,
    manifests,
    skipped: Object.freeze(skipped),
    batches: budget.batches,
    complete: !budget.stopped,
    leftoverChunksSealed,
    scrub
  });
}

async function holdsRetiredKeys(database: AutomationStudioProjectDatabase, currentKeyId: string): Promise<boolean> {
  const row = await database.get<{ held: number }>("select exists (select 1 from content_address_keys where key_id <> ?) as held", [currentKeyId]);
  return row?.held === 1;
}
