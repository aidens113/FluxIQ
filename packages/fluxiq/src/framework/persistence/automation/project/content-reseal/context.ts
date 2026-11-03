// What every re-seal pass works with (t747 design note b): the project
// database, the project id and protection the sealed forms are bound to, the
// retiring host keys, the batch size, what is unreadable so far, the batch
// count and the test seams. A pass names an item by kind and id only: an
// object id, a trace id, an address key id, or a chunk's keyed digest (a chunk
// still under the plain SHA-256 is named by its row, never by that digest).
import type { AutomationStudioProjectDatabase } from "../database.ts";
import type { ContentResealRetiringKeys } from "./retiring-keys.ts";

/** The four kinds of sealed item a project holds. */
export type ContentResealKind = "object" | "chunk" | "manifest" | "address-key";

/** One item by kind and id: never content, a key, a file path or a plain digest. */
export type ContentResealItem = { readonly kind: ContentResealKind; readonly id: string };

/**
 * Test seams; production passes none. `afterBatch` runs after each committed
 * batch (a test throws from it to stop a run part way), `afterMainPass` once
 * the first pass over every kind is done, before the verification passes, and
 * `beforeObjectCommit` after a batch's re-sealed object files are written and
 * before the transaction that moves the rows to them.
 */
export type AutomationStudioProjectContentResealSeams = {
  afterBatch?: (kind: ContentResealKind) => Promise<void>;
  afterMainPass?: () => Promise<void>;
  beforeObjectCommit?: () => Promise<void>;
};

/** What one pass over one kind did. */
export type ContentResealPassResult = {
  resealed: number;
  /** Rows another writer changed between the read and the batch's commit; the next pass looks at them again. */
  changed: number;
};

export type ContentResealContext = {
  readonly database: AutomationStudioProjectDatabase;
  readonly projectId: string;
  readonly keys: ContentResealRetiringKeys;
  readonly batchSize: number;
  /** Items that did not open, by `kind:id`; reported once and never retried or rewritten. */
  readonly unreadable: Map<string, ContentResealItem>;
  readonly seams: AutomationStudioProjectContentResealSeams;
  /** Batches committed so far, by every pass. */
  batches: number;
};
