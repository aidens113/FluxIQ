// Re-sealing a project's sealed content for host key retirement (t747 design
// note b). A host runs this job after making its new key current, with the old
// key ids in `retiringKeyIds`; it re-seals, under the current key, every item
// whose envelope names a retiring key: content-store objects (in place, by the
// content store), gateway trace chunks and manifests, and the wrapped
// content-address keys, current and retired. The contract it serves is on
// `AutomationStudioProjectContentProtection`: new key current while the old id
// still resolves, then this job until it reports `complete`, then stop
// resolving the old id.
//
// Before anything is written the job refuses a provider without
// `sealedKeyId` and a host whose fresh seal still names a retiring key. It
// keeps no state of its own: every batch is one transaction guarded by
// compare-and-swap on the sealed form it read, so a stop rolls back only the
// open batch and a rerun finds exactly the items still under a retiring key.
// After the first pass over every kind it keeps passing until a whole pass
// finds no readable item under a retiring key and loses no compare-and-swap,
// so an item a stale process sealed under the old key just before the switch
// is caught. An item that does not open is reported by kind and id, never
// rewritten: it was already lost. Each re-sealing batch requests a scrub of the
// database file, and the job honours it at the end (VACUUM, then a truncate
// checkpoint), after the old object files are drained, so no old sealed form
// survives in a free page, the WAL or an object file.
import type { ContentAddressScrubStatus } from "../content-address/index.ts";
import { scrubProjectDatabaseIfRequested } from "../content-address/index.ts";
import type { AutomationStudioProjectContentProtection } from "../content-protection.ts";
import { AutomationStudioProjectContentStore } from "../content-store.ts";
import type { AutomationStudioProjectDatabasePool } from "../database.ts";
import { resealContentAddressKeyRows } from "./address-key-pass.ts";
import { resealGatewayTraceChunkRows } from "./chunk-pass.ts";
import type { AutomationStudioProjectContentResealSeams, ContentResealContext, ContentResealItem, ContentResealPassResult } from "./context.ts";
import { resealGatewayTraceManifestRows } from "./manifest-pass.ts";
import { resealContentObjects } from "./object-pass.ts";
import { ContentResealRetiringKeys } from "./retiring-keys.ts";
import { sealedGatewayTraceTables } from "./trace-tables.ts";

export type AutomationStudioProjectContentResealOptions = {
  /** Rows read per batch, 1 to 500 (50 by default). */
  batchSize?: number;
  seams?: AutomationStudioProjectContentResealSeams;
};

/** Items re-sealed, per kind, over every pass. */
export type AutomationStudioProjectContentResealCounts = { objects: number; chunks: number; manifests: number; addressKeys: number };

export type AutomationStudioProjectContentResealResult = {
  readonly retiringKeyIds: readonly string[];
  readonly resealed: Readonly<AutomationStudioProjectContentResealCounts>;
  /** Items under a retiring key that did not open, by kind and id; left as they are. */
  readonly unreadable: readonly ContentResealItem[];
  /** Passes over every kind: the main pass and the verification passes after it. */
  readonly passes: number;
  readonly batches: number;
  /** Released object files the final drain could not remove; the next drain retries them. */
  readonly filesNotRemoved: number;
  /** What honouring the scrub request at the end did. */
  readonly scrub: ContentAddressScrubStatus;
  /**
   * True when the last pass found no readable item under a retiring key and
   * every old object file is gone: the host may stop resolving those keys.
   * Unreadable items do not hold it back; they cannot be re-sealed.
   */
  readonly complete: boolean;
};

const DEFAULT_BATCH_SIZE = 50;
const MAX_BATCH_SIZE = 500;
/** A writer that keeps sealing under a retiring key is refused by the seal; this bounds a run against endless lost swaps. */
const MAX_PASSES = 10;

export async function resealAutomationStudioProjectContent(input: {
  pool: AutomationStudioProjectDatabasePool;
  projectId: string;
  protection: AutomationStudioProjectContentProtection;
  retiringKeyIds: readonly string[];
  options?: AutomationStudioProjectContentResealOptions;
}): Promise<AutomationStudioProjectContentResealResult> {
  const batchSize = boundedBatchSize(input.options?.batchSize ?? DEFAULT_BATCH_SIZE);
  const keys = await ContentResealRetiringKeys.check(input);
  const seams = input.options?.seams ?? {};
  const content = await AutomationStudioProjectContentStore.open({
    pool: input.pool,
    projectId: input.projectId,
    protection: input.protection,
    ...(seams.beforeObjectCommit ? { seams: { beforeResealCommit: seams.beforeObjectCommit } } : {})
  });
  try {
    const lease = await input.pool.acquire(input.projectId);
    try {
      const context: ContentResealContext = { database: lease.database, projectId: input.projectId, keys, batchSize, unreadable: new Map(), seams, batches: 0 };
      const resealed: AutomationStudioProjectContentResealCounts = { objects: 0, chunks: 0, manifests: 0, addressKeys: 0 };
      let passes = 0;
      let settled = false;
      while (passes < MAX_PASSES && (passes < 2 || !settled)) {
        passes += 1;
        settled = await resealPass(context, content, resealed);
        if (passes === 1) await seams.afterMainPass?.();
      }
      const filesNotRemoved = (await content.drainPendingRemovals()).failed.length;
      const scrub = await scrubProjectDatabaseIfRequested(lease.database);
      return Object.freeze({
        retiringKeyIds: keys.ids,
        resealed: Object.freeze(resealed),
        unreadable: Object.freeze([...context.unreadable.values()]),
        passes,
        batches: context.batches,
        filesNotRemoved,
        scrub,
        complete: settled && filesNotRemoved === 0
      });
    } finally {
      await lease.release();
    }
  } finally {
    await content.close();
  }
}

/** One pass over every kind; whether it found nothing left to re-seal and lost no compare-and-swap. */
async function resealPass(context: ContentResealContext, content: AutomationStudioProjectContentStore, resealed: AutomationStudioProjectContentResealCounts): Promise<boolean> {
  // Checked on every pass: a stale writer may create the trace tables while the job runs.
  const tables = await sealedGatewayTraceTables(context.database);
  const none: ContentResealPassResult = { resealed: 0, changed: 0 };
  const objects = await resealContentObjects(context, content);
  const chunks = tables.chunks ? await resealGatewayTraceChunkRows(context) : none;
  const manifests = tables.manifests ? await resealGatewayTraceManifestRows(context) : none;
  const addressKeys = await resealContentAddressKeyRows(context);
  resealed.objects += objects.resealed;
  resealed.chunks += chunks.resealed;
  resealed.manifests += manifests.resealed;
  resealed.addressKeys += addressKeys.resealed;
  return [objects, chunks, manifests, addressKeys].every((pass) => pass.resealed === 0 && pass.changed === 0);
}

function boundedBatchSize(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_BATCH_SIZE) throw new Error(`Project content re-seal batchSize must be an integer from 1 to ${MAX_BATCH_SIZE}.`);
  return value;
}
