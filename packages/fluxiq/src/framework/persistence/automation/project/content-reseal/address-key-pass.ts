// The content-address key pass (t747 design note b): every wrapped address
// key, current or retired, whose seal names a retiring host key is opened and
// sealed again under the current host key. The key id, the key bytes and the
// retirement stay, so every address made under the key still verifies; only
// the sealed form and its envelope change. A fresh seal that holds the key's
// bytes as they are is refused, as it is when the key is first made.
import type { AutomationStudioProjectDatabase } from "../database.ts";
import { AUTOMATION_STUDIO_CONTENT_ADDRESS_KEY_MEDIA_TYPE } from "../content-address/index.ts";
import type { ContentResealContext, ContentResealPassResult } from "./context.ts";
import { resealSealedRows } from "./row-pass.ts";
import type { ContentResealRowSpec } from "./row-pass.ts";

type KeyRow = { key_id: string; sealed: Buffer; encryption: string };

const ADDRESS_KEY_SPEC: ContentResealRowSpec<KeyRow> = {
  kind: "address-key",
  mediaType: AUTOMATION_STUDIO_CONTENT_ADDRESS_KEY_MEDIA_TYPE,
  page: (database: AutomationStudioProjectDatabase, after: KeyRow | null, limit: number) => database.all<KeyRow>(
    "select key_id, sealed, encryption from content_address_keys where key_id > ? order by key_id limit ?",
    [after?.key_id ?? "", limit]
  ),
  id: (row) => row.key_id,
  sealedForm: (row) => ({ content: Buffer.from(row.sealed), encryption: row.encryption }),
  checkFresh: (opened, fresh, row) => {
    if (fresh.content.includes(opened)) throw new Error(`Content address key ${row.key_id} was not sealed.`);
  },
  write: async (sql, row, fresh) => {
    const result = await sql.run(
      "update content_address_keys set sealed = ?, encryption = ? where key_id = ? and sealed = ? and encryption = ?",
      [fresh.content, fresh.encryption, row.key_id, row.sealed, row.encryption]
    );
    return result.changes === 1;
  }
};

export function resealContentAddressKeyRows(context: ContentResealContext): Promise<ContentResealPassResult> {
  return resealSealedRows(context, ADDRESS_KEY_SPEC);
}
