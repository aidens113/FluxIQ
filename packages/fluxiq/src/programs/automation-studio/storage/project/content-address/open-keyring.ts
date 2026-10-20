// Opening a project's content-address keyring (t745 design note D1, D4 step 2).
// The first protected open creates the key; concurrent creators converge
// because the insert runs in an immediate transaction that first checks for a
// current row, the schema allows only one, and every opener then loads the
// stored rows rather than the key it generated. The current row must open with
// the protection: one that does not open (another project's row, a missing or
// wrong host key) or does not hold exactly 256 bits fails the whole open,
// naming only its key id. A retired row that does not open (its host key was
// retired since) is left out instead: the keyring does not hold it, so only the
// rows still under it fail when read, and the store itself stays usable.
import type { AutomationStudioSqlExecutor } from "../database.ts";
import { AUTOMATION_STUDIO_CONTENT_ADDRESS_KEY_MEDIA_TYPE } from "./key-media-type.ts";
import { AutomationStudioContentAddressKeyring } from "./keyring.ts";
import { assertContentAddressKeyringInput } from "./keyring-input.ts";
import type { AutomationStudioContentAddressKeyringInput } from "./keyring-input.ts";
import { insertContentAddressKeyRow, sealNewContentAddressKey } from "./new-key-row.ts";

type StoredKeyRow = { keyId: string; sealed: Buffer; encryption: string; retiredAt: number | null };
/** A retired row either opens, or is named as unavailable: never read as "no key there". */
type RetiredKeyOpening = { status: "opened"; key: Buffer } | { status: "unavailable"; keyId: string };

const ADDRESS_KEY_BYTES = 32;

export async function openAutomationStudioContentAddressKeyring(input: AutomationStudioContentAddressKeyringInput): Promise<AutomationStudioContentAddressKeyring> {
  assertContentAddressKeyringInput(input);
  let rows = await loadKeyRows(input.database);
  if (!rows.some((row) => row.retiredAt === null)) {
    await createCurrentKey(input);
    rows = await loadKeyRows(input.database);
  }
  const current = rows.filter((row) => row.retiredAt === null);
  if (current.length !== 1) throw new Error("Content address keyring has no single current key.");
  const keys = new Map<string, Buffer>();
  const unavailableKeyIds: string[] = [];
  try {
    for (const row of rows) {
      if (row.retiredAt === null) {
        keys.set(row.keyId, await openKeyRow(input, row));
        continue;
      }
      const opening = await openRetiredKeyRow(input, row);
      if (opening.status === "opened") keys.set(row.keyId, opening.key);
      else unavailableKeyIds.push(opening.keyId);
    }
    return new AutomationStudioContentAddressKeyring({ projectId: input.projectId, currentKeyId: current[0]!.keyId, keys, unavailableKeyIds });
  } finally {
    for (const key of keys.values()) key.fill(0);
  }
}

async function createCurrentKey(input: AutomationStudioContentAddressKeyringInput): Promise<void> {
  const row = await sealNewContentAddressKey(input);
  const createdAt = (input.now ?? Date.now)();
  await input.database.transaction(async (sql) => {
    if (await currentKeyId(sql)) return;
    await insertContentAddressKeyRow(sql, row, createdAt);
  });
}

async function currentKeyId(sql: AutomationStudioSqlExecutor): Promise<string | undefined> {
  const row = await sql.get<{ keyId: string }>("select key_id as keyId from content_address_keys where retired_at_ms is null");
  return row?.keyId;
}

async function loadKeyRows(sql: AutomationStudioSqlExecutor): Promise<StoredKeyRow[]> {
  return sql.all<StoredKeyRow>("select key_id as keyId, sealed, encryption, retired_at_ms as retiredAt from content_address_keys order by created_at_ms, key_id");
}

async function openRetiredKeyRow(input: AutomationStudioContentAddressKeyringInput, row: StoredKeyRow): Promise<RetiredKeyOpening> {
  try {
    return { status: "opened", key: await openKeyRow(input, row) };
  } catch {
    // Named, not dropped: the keyring reports this key as unavailable to every row still under it.
    return { status: "unavailable", keyId: row.keyId };
  }
}

async function openKeyRow(input: AutomationStudioContentAddressKeyringInput, row: StoredKeyRow): Promise<Buffer> {
  let key: Buffer;
  try {
    key = await input.protection.open({
      projectId: input.projectId,
      mediaType: AUTOMATION_STUDIO_CONTENT_ADDRESS_KEY_MEDIA_TYPE,
      content: Buffer.from(row.sealed),
      encryption: row.encryption
    });
  } catch {
    // The provider's own error is dropped: a custom provider might describe what it opened.
    throw new Error(`Content address key ${row.keyId} could not be opened.`);
  }
  if (key.byteLength !== ADDRESS_KEY_BYTES) {
    key.fill(0);
    throw new Error(`Content address key ${row.keyId} is not a 256-bit key.`);
  }
  return key;
}
