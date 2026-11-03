// The content object pass (t747 design note b): every sealed object whose
// envelope names a retiring key is re-sealed in place by the content store
// (`AutomationStudioProjectContentStore.resealObjects`): a new file at the new
// sealed form's sha256, the row moved to it by compare-and-swap with its
// object id, references and content address unchanged, and the old file
// released and drained. Objects are paged here by id; one page is one batch.
import type { AutomationStudioProjectContentStore } from "../content-store.ts";
import type { ContentResealContext, ContentResealPassResult } from "./context.ts";

type ObjectRow = { object_id: string; encryption: string };

export async function resealContentObjects(context: ContentResealContext, content: AutomationStudioProjectContentStore): Promise<ContentResealPassResult> {
  const result: ContentResealPassResult = { resealed: 0, changed: 0 };
  let after = "";
  for (;;) {
    const rows = await context.database.all<ObjectRow>(
      "select object_id, encryption from objects where encryption is not null and object_id > ? order by object_id limit ?",
      [after, context.batchSize]
    );
    if (rows.length === 0) return result;
    after = rows[rows.length - 1]!.object_id;
    const selected: string[] = [];
    for (const row of rows) {
      if (context.unreadable.has(`object:${row.object_id}`)) continue;
      const standing = context.keys.standing(row.encryption);
      if (standing === "retiring") selected.push(row.object_id);
      if (standing === "unreadable") context.unreadable.set(`object:${row.object_id}`, { kind: "object", id: row.object_id });
    }
    if (selected.length > 0) {
      const batch = await content.resealObjects(selected, context.keys);
      for (const id of batch.unreadable) context.unreadable.set(`object:${id}`, { kind: "object", id });
      result.resealed += batch.resealed.length;
      result.changed += batch.changed;
      context.batches += 1;
      await context.seams.afterBatch?.("object");
    }
    if (rows.length < context.batchSize) return result;
  }
}
