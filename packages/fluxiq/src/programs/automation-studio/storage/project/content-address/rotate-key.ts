// Address key rotation (t745 design note D3): one transaction retires the
// current key and makes a new one current. Retired keys stay in the table and
// stay loadable, because a process that opened before the rotation may still
// write under one, and rows under it must stay verifiable until they are rekeyed.
import { assertContentAddressKeyringInput } from "./keyring-input.ts";
import type { AutomationStudioContentAddressKeyringInput } from "./keyring-input.ts";
import { insertContentAddressKeyRow, sealNewContentAddressKey } from "./new-key-row.ts";

export async function rotateAutomationStudioContentAddressKey(input: AutomationStudioContentAddressKeyringInput): Promise<{ keyId: string }> {
  assertContentAddressKeyringInput(input);
  const row = await sealNewContentAddressKey(input);
  const now = (input.now ?? Date.now)();
  await input.database.transaction(async (sql) => {
    await sql.run("update content_address_keys set retired_at_ms = ? where retired_at_ms is null", [now]);
    await insertContentAddressKeyRow(sql, row, now);
  });
  return { keyId: row.keyId };
}
