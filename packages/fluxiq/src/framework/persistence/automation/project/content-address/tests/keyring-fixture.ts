// Test support for the content-address keyring: a project database migrated
// through 0033, an AES-GCM protection over synthetic host keys, and a way to
// recover a stored address key the way only a holder of the host key could.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../../administration.ts";
import { AutomationStudioAesGcmProjectContentProtection } from "../../content-protection.ts";
import type { AutomationStudioProjectContentProtectionKey } from "../../content-protection.ts";
import { AutomationStudioProjectDatabasePool } from "../../database.ts";
import type { AutomationStudioProjectDatabase } from "../../database.ts";
import { AutomationStudioSchemaMigrationRunner } from "../../../schema-migrations.ts";
import { AUTOMATION_STUDIO_CONTENT_ADDRESS_KEY_MEDIA_TYPE, AUTOMATION_STUDIO_CONTENT_ADDRESS_MIGRATION } from "../index.ts";

export type KeyringTestProject = {
  pool: AutomationStudioProjectDatabasePool;
  database: AutomationStudioProjectDatabase;
  close(): Promise<void>;
};

export type StoredKeyRow = { keyId: string; sealed: Buffer; encryption: string; createdAt: number; retiredAt: number | null };

export async function makeTempRoot(): Promise<{ rootDir: string; remove(): Promise<void> }> {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "automation-studio-content-address-test-"));
  return { rootDir, remove: () => rm(rootDir, { recursive: true, force: true }) };
}

/** A project database on its own pool (its own connection), migrated through 0033. */
export async function openTestProject(rootDir: string, projectId: string): Promise<KeyringTestProject> {
  const pool = new AutomationStudioProjectDatabasePool({ rootDir });
  const lease = await pool.acquire(projectId);
  const migrations = [...AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS, AUTOMATION_STUDIO_CONTENT_ADDRESS_MIGRATION];
  await new AutomationStudioSchemaMigrationRunner({ database: lease.database, migrations }).migrate();
  return {
    pool,
    database: lease.database,
    close: async () => {
      await lease.release();
      await pool.closeAll();
    }
  };
}

/** One synthetic host key, the same for every project, as a host that shares one key would do. */
export function hostProtection(fill = 7, keyId = "host.key.1"): AutomationStudioAesGcmProjectContentProtection {
  return new AutomationStudioAesGcmProjectContentProtection((request) => resolveSynthetic(request.keyId, keyId, fill));
}

/** A protection whose host resolves no key at all. */
export function keylessProtection(): AutomationStudioAesGcmProjectContentProtection {
  return new AutomationStudioAesGcmProjectContentProtection(() => undefined);
}

export async function storedKeyRows(database: AutomationStudioProjectDatabase): Promise<StoredKeyRow[]> {
  return database.all<StoredKeyRow>(
    "select key_id as keyId, sealed, encryption, created_at_ms as createdAt, retired_at_ms as retiredAt from content_address_keys order by created_at_ms, key_id"
  );
}

/** The raw address key, recovered with the host's protection (what the keyring holds privately). */
export async function rawAddressKey(input: { protection: AutomationStudioAesGcmProjectContentProtection; projectId: string; row: StoredKeyRow }): Promise<Buffer> {
  return input.protection.open({
    projectId: input.projectId,
    mediaType: AUTOMATION_STUDIO_CONTENT_ADDRESS_KEY_MEDIA_TYPE,
    content: input.row.sealed,
    encryption: input.row.encryption
  });
}

function resolveSynthetic(requestedKeyId: string | undefined, keyId: string, fill: number): AutomationStudioProjectContentProtectionKey | undefined {
  if (requestedKeyId !== undefined && requestedKeyId !== keyId) return undefined;
  return { keyId, key: Buffer.alloc(32, fill) };
}
