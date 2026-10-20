// Test support for keyed gateway trace addresses (t745 u3a): the host protection
// the protection tests use, large serialized views, a recorder that keeps a copy
// of exactly what reached the store, every file under a project directory, the
// project's keyring as a holder of the host key would open it, and the rows the
// keyed tests read.
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { ClientGatewayTraceEvent, ClientGatewayTraceStoreWriter } from "../../../../../../client-gateway/trace/index.ts";
import { artifactInput, newRecorder, textEvent } from "../../../../../../client-gateway/trace/tests/trace-builders.ts";
import { openAutomationStudioContentAddressKeyring } from "../../content-address/index.ts";
import type { AutomationStudioContentAddressKeyring } from "../../content-address/index.ts";
import { AutomationStudioAesGcmProjectContentProtection } from "../../content-protection.ts";
import type { AutomationStudioProjectDatabasePool } from "../../database.ts";
import type { AutomationStudioProjectGatewayTraceStore } from "../index.ts";

export function hostProtection(keyByte = 7, keyId = "key.1"): AutomationStudioAesGcmProjectContentProtection {
  return new AutomationStudioAesGcmProjectContentProtection(() => ({ keyId, key: Buffer.alloc(32, keyByte) }));
}

/** A serialized view of `count` entries; about `count` * 60 bytes. */
export function viewText(count: number, salt: string): string {
  const items: string[] = [];
  for (let index = 0; index < count; index += 1) items.push(`{"id":"e${index}","label":"Item ${salt}-${index}","stock":${index % 89}}`);
  return `{"type":"client.state_update","entries":[${items.join(",")}]}`;
}

export function sha256(bytes: Uint8Array | string): Buffer {
  return createHash("sha256").update(bytes).digest();
}

/** Records the texts (and artifacts, after them) into one trace; returns the events exactly as they reached the store. */
export async function recordTrace(
  store: AutomationStudioProjectGatewayTraceStore,
  traceId: string,
  texts: readonly string[],
  artifacts: readonly Uint8Array[] = []
): Promise<ClientGatewayTraceEvent[]> {
  const written: ClientGatewayTraceEvent[] = [];
  const writer: ClientGatewayTraceStoreWriter = {
    writeArtifact: (id, artifactId, bytes) => store.writeArtifact(id, artifactId, bytes),
    appendEvents: async (id, events) => {
      await store.appendEvents(id, events);
      written.push(...events);
    },
    writeManifest: (manifest) => store.writeManifest(manifest)
  };
  const { recorder } = newRecorder({ store: writer }, { traceId, episodeId: `run-${traceId}` });
  for (const text of texts) recorder.record(textEvent(text));
  // The resource key a live capture carries is the object's plain SHA-256, as the manifest keeps it.
  for (const bytes of artifacts) recorder.recordArtifact({ ...artifactInput(bytes), resourceKey: sha256(bytes).toString("hex") });
  await recorder.close({ terminationReason: "completed", terminationDetail: null });
  return written;
}

export function eventTexts(events: readonly ClientGatewayTraceEvent[]): string[] {
  return events.map((event) => JSON.stringify(event));
}

/** Every file under the project directory: the database, its WAL if one is left, the content object files. */
export async function projectFiles(directory: string): Promise<Array<{ name: string; bytes: Buffer }>> {
  const files: Array<{ name: string; bytes: Buffer }> = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await projectFiles(name)));
    if (entry.isFile()) files.push({ name, bytes: await readFile(name) });
  }
  return files;
}

/** The project's content-address keyring, opened from its stored key row with the host protection. */
export async function projectKeyring(
  pool: AutomationStudioProjectDatabasePool,
  projectId: string,
  protection: AutomationStudioAesGcmProjectContentProtection
): Promise<AutomationStudioContentAddressKeyring> {
  const lease = await pool.acquire(projectId);
  try {
    return await openAutomationStudioContentAddressKeyring({ database: lease.database, projectId, protection });
  } finally {
    await lease.release();
  }
}

export type KeyedEventRow = { sequence: number; digests: Buffer | null; keyId: string | null; json: string | null };
export type KeyedChunkRow = { digest: Buffer; keyId: string | null; byteLength: number; encryption: string | null };

export const EVENT_ROWS_SQL = `select sequence, event_chunk_digests as digests, event_chunk_address_key_id as keyId, event_json as json
  from client_gateway_trace_events where trace_id = ? order by sequence`;
export const CHUNK_ROWS_SQL = "select digest, address_key_id as keyId, byte_length as byteLength, encryption from client_gateway_trace_chunks order by digest";

/** A chunk list split into its 32-byte digests. */
export function digestsOf(list: Buffer | null): Buffer[] {
  if (list === null) return [];
  const digests: Buffer[] = [];
  for (let offset = 0; offset < list.byteLength; offset += 32) digests.push(list.subarray(offset, offset + 32));
  return digests;
}
