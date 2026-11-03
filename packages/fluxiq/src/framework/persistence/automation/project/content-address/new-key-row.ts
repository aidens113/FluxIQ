// Making and storing a new address key: a random 256-bit key, sealed by the
// project's protection, whose plaintext is zeroed as soon as it is sealed. The
// caller never keeps the generated key; it reloads the stored row and opens it,
// so every holder of a key got it from the same sealed row.
import { randomBytes } from "node:crypto";
import type { AutomationStudioProjectContentProtection } from "../content-protection.ts";
import type { AutomationStudioSqlExecutor } from "../database.ts";
import { AUTOMATION_STUDIO_CONTENT_ADDRESS_KEY_MEDIA_TYPE } from "./key-media-type.ts";

export type SealedContentAddressKeyRow = { keyId: string; sealed: Buffer; encryption: string };

const ADDRESS_KEY_BYTES = 32;

export async function sealNewContentAddressKey(input: { projectId: string; protection: AutomationStudioProjectContentProtection }): Promise<SealedContentAddressKeyRow> {
  const keyId = `cak.${randomBytes(8).toString("hex")}`;
  const key = randomBytes(ADDRESS_KEY_BYTES);
  try {
    const sealed = await input.protection.seal({ projectId: input.projectId, mediaType: AUTOMATION_STUDIO_CONTENT_ADDRESS_KEY_MEDIA_TYPE, content: key });
    if (typeof sealed.encryption !== "string" || !sealed.encryption) throw new Error(`Content address key ${keyId} was sealed without an envelope.`);
    // A provider that returned the key as it was given would store it in the clear.
    if (Buffer.from(sealed.content).includes(key)) throw new Error(`Content address key ${keyId} was not sealed.`);
    return { keyId, sealed: Buffer.from(sealed.content), encryption: sealed.encryption };
  } finally {
    key.fill(0);
  }
}

export async function insertContentAddressKeyRow(sql: AutomationStudioSqlExecutor, row: SealedContentAddressKeyRow, createdAt: number): Promise<void> {
  await sql.run(
    "insert into content_address_keys (key_id, sealed, encryption, created_at_ms, retired_at_ms) values (?, ?, ?, ?, null)",
    [row.keyId, row.sealed, row.encryption, createdAt]
  );
}
