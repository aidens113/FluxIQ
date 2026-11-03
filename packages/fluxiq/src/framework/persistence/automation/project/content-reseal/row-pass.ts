// One re-seal pass over a kind whose sealed form lives in a database row
// (t747 design note b): trace chunks, trace manifests, content-address keys.
// It walks every sealed row in key order, a page at a time; a row whose
// envelope names a retiring key is opened and sealed again under the host's
// current key (the seal refuses a key that is still retiring), and the page's
// re-sealed rows are written in one transaction, each guarded on the row
// still holding the sealed form that was read (compare-and-swap), so a row
// another writer replaced in between is left as it is and counted. A batch
// that re-sealed any row requests a scrub in the same transaction, so the old
// form does not survive in free pages or the WAL. A row that does not open, or
// whose envelope is not the provider's, is recorded as unreadable by kind and
// id and never written. Selection needs no job state: a rerun after a stop
// finds exactly the rows still under a retiring key.
import { requestContentAddressScrub } from "../content-address/index.ts";
import type { AutomationStudioProjectDatabase, AutomationStudioSqlExecutor } from "../database.ts";
import type { ContentResealContext, ContentResealKind, ContentResealPassResult } from "./context.ts";

/** A row's sealed form: the sealed bytes and their envelope. */
export type ContentResealSealedForm = { content: Buffer; encryption: string };

/** How one kind's rows are paged, named, decoded and written back. */
export type ContentResealRowSpec<Row> = {
  readonly kind: ContentResealKind;
  /** The media type the kind is sealed under (the protection binds it). */
  readonly mediaType: string;
  /** Sealed rows after `after` (null: from the start) in key order, at most `limit`. */
  page(database: AutomationStudioProjectDatabase, after: Row | null, limit: number): Promise<Row[]>;
  /** The row's id for reporting: never content or a plain digest. */
  id(row: Row): string;
  /** The row's sealed form; throws when the row does not hold one it can read. */
  sealedForm(row: Row): ContentResealSealedForm;
  /** Checks a fresh seal before it is written (throws to refuse); optional. */
  checkFresh?(opened: Buffer, fresh: ContentResealSealedForm, row: Row): void;
  /** Writes `fresh` while the row still holds the form read; whether it did. */
  write(sql: AutomationStudioSqlExecutor, row: Row, fresh: ContentResealSealedForm): Promise<boolean>;
};

type Opening = { outcome: "skip" } | { outcome: "unreadable"; reason: string } | { outcome: "opened"; content: Buffer };

export async function resealSealedRows<Row>(context: ContentResealContext, spec: ContentResealRowSpec<Row>): Promise<ContentResealPassResult> {
  const result: ContentResealPassResult = { resealed: 0, changed: 0 };
  let after: Row | null = null;
  for (;;) {
    const rows = await spec.page(context.database, after, context.batchSize);
    if (rows.length === 0) return result;
    after = rows[rows.length - 1]!;
    const batch: Array<{ row: Row; fresh: ContentResealSealedForm }> = [];
    for (const row of rows) {
      const fresh = await resealRow(context, spec, row);
      if (fresh) batch.push({ row, fresh });
    }
    if (batch.length > 0) {
      const written = await context.database.transaction(async (sql) => {
        let count = 0;
        for (const item of batch) if (await spec.write(sql, item.row, item.fresh)) count += 1;
        if (count > 0) await requestContentAddressScrub(sql, Date.now());
        return count;
      });
      result.resealed += written;
      result.changed += batch.length - written;
      context.batches += 1;
      await context.seams.afterBatch?.(spec.kind);
    }
    if (rows.length < context.batchSize) return result;
  }
}

/** The row sealed again under the current key, or undefined when it is not under a retiring key or does not open. */
async function resealRow<Row>(context: ContentResealContext, spec: ContentResealRowSpec<Row>, row: Row): Promise<ContentResealSealedForm | undefined> {
  const id = spec.id(row);
  if (context.unreadable.has(`${spec.kind}:${id}`)) return undefined;
  const opening = await openRow(context, spec, row);
  if (opening.outcome === "unreadable") context.unreadable.set(`${spec.kind}:${id}`, { kind: spec.kind, id });
  if (opening.outcome !== "opened") return undefined;
  try {
    const fresh = await context.keys.seal({ mediaType: spec.mediaType, content: opening.content }, `${spec.kind} ${id}`);
    spec.checkFresh?.(opening.content, fresh, row);
    return fresh;
  } finally {
    opening.content.fill(0);
  }
}

async function openRow<Row>(context: ContentResealContext, spec: ContentResealRowSpec<Row>, row: Row): Promise<Opening> {
  try {
    const sealed = spec.sealedForm(row);
    if (!context.keys.isRetiring(sealed.encryption)) return { outcome: "skip" };
    return { outcome: "opened", content: await context.keys.open({ mediaType: spec.mediaType, ...sealed }) };
  } catch (error) {
    // The class name only: a provider's message might describe what it opened. The item is reported by kind and id.
    return { outcome: "unreadable", reason: error instanceof Error ? error.name : typeof error };
  }
}
