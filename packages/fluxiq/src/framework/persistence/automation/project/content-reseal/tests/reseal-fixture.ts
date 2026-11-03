// Test support for the re-seal job (t747 b): a host whose resolver holds k1 and
// k2 and whose current key and held keys a test switches, a project holding
// every sealed kind under k1 (two traces with chunked events, artifacts and
// manifests, a sealed content object, a current and a retired content-address
// key), everything that project reads back, its sealed forms as stored, and a
// scan of every file under the storage root.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { rotateAutomationStudioContentAddressKey } from "../../content-address/index.ts";
import { AutomationStudioAesGcmProjectContentProtection } from "../../content-protection.ts";
import type { AutomationStudioProjectContentProtection } from "../../content-protection.ts";
import { AutomationStudioProjectContentStore } from "../../content-store.ts";
import { AutomationStudioProjectDatabasePool } from "../../database.ts";
import type { AutomationStudioProjectDatabase } from "../../database.ts";
import { AutomationStudioProjectGatewayTraceStore } from "../../gateway-trace/index.ts";
import { recordTrace, viewText } from "../../gateway-trace/tests/keyed-trace-support.ts";

export const PROJECT = "project.reseal";
export const PLAIN_OBJECT = Buffer.from(JSON.stringify({ note: "a sealed content object", items: [1, 2, 3] }), "utf8");
const OWNER = { ownerKind: "reseal_test", ownerId: "owner", purpose: "payload" };

/** A host key resolver holding k1 and k2; tests switch `current` and delete keys. */
export class SwitchableHost {
  current = "k1";
  readonly keys = new Map<string, Buffer>([["k1", Buffer.alloc(32, 0x11)], ["k2", Buffer.alloc(32, 0x22)]]);

  /** The host's protection: seals under `current`, opens with any key still held. */
  protection(): AutomationStudioAesGcmProjectContentProtection {
    return new AutomationStudioAesGcmProjectContentProtection(({ keyId }) => this.resolve(keyId ?? this.current));
  }

  /** A process that has not seen the switch: it still seals under `keyId`. */
  pinned(keyId: string): AutomationStudioAesGcmProjectContentProtection {
    return new AutomationStudioAesGcmProjectContentProtection(({ keyId: requested }) => this.resolve(requested ?? keyId));
  }

  private resolve(keyId: string): { keyId: string; key: Buffer } | undefined {
    const key = this.keys.get(keyId);
    return key ? { keyId, key } : undefined;
  }
}

export type ProjectReads = { traces: Record<string, { events: string[]; manifest: string; artifacts: string[] }>; object: string };

export type SealedProject = { pool: AutomationStudioProjectDatabasePool; objectId: string; traceIds: string[] };

/** A project with every sealed kind under the host's current key (k1), on its own pool. */
export async function sealedProject(rootDir: string, host: SwitchableHost): Promise<SealedProject> {
  const pool = new AutomationStudioProjectDatabasePool({ rootDir });
  const protection = host.protection();
  await writeTrace(pool, protection, "trace-a", "a");
  await withDatabase(pool, (database) => rotateAutomationStudioContentAddressKey({ database, projectId: PROJECT, protection }));
  await writeTrace(pool, protection, "trace-b", "b");
  const content = await AutomationStudioProjectContentStore.open({ pool, projectId: PROJECT, protection });
  try {
    const written = await content.putBytes({ content: PLAIN_OBJECT, mediaType: "application/json", extension: "json", owner: OWNER, protect: true });
    return { pool, objectId: written.object.objectId, traceIds: ["trace-a", "trace-b"] };
  } finally {
    await content.close();
  }
}

/** Records a trace with two chunked events, a small one and two artifacts. */
export async function writeTrace(pool: AutomationStudioProjectDatabasePool, protection: AutomationStudioProjectContentProtection, traceId: string, salt: string): Promise<void> {
  const store = await AutomationStudioProjectGatewayTraceStore.open({ pool, projectId: PROJECT, protection });
  try {
    await recordTrace(store, traceId, [viewText(400, `${salt}1`), viewText(400, `${salt}2`), `small ${salt}`], [Buffer.from(`artifact one ${salt}`), Buffer.from(`artifact two ${salt}`)]);
  } finally {
    await store.close();
  }
}

/** Everything the project reads back through its stores with `protection`; throws when anything does not open. */
export async function readEverything(pool: AutomationStudioProjectDatabasePool, protection: AutomationStudioProjectContentProtection, project: { objectId: string; traceIds: readonly string[] }): Promise<ProjectReads> {
  const traces: ProjectReads["traces"] = {};
  const store = await AutomationStudioProjectGatewayTraceStore.open({ pool, projectId: PROJECT, protection });
  try {
    for (const traceId of project.traceIds) {
      const events = await store.readEventRange(traceId, 1, Number.MAX_SAFE_INTEGER);
      const artifacts: string[] = [];
      for (const artifact of await store.listArtifacts(traceId)) artifacts.push(Buffer.from((await store.readArtifact(traceId, artifact.id))!).toString("base64"));
      traces[traceId] = { events: events.map((event) => JSON.stringify(event)), manifest: JSON.stringify(await store.readManifest(traceId)), artifacts };
    }
  } finally {
    await store.close();
  }
  const content = await AutomationStudioProjectContentStore.open({ pool, projectId: PROJECT, protection });
  try {
    return { traces, object: (await content.readBytesByObjectId(project.objectId)).content.toString("base64") };
  } finally {
    await content.close();
  }
}

export async function withDatabase<T>(pool: AutomationStudioProjectDatabasePool, operation: (database: AutomationStudioProjectDatabase) => Promise<T>): Promise<T> {
  const lease = await pool.acquire(PROJECT);
  try {
    return await operation(lease.database);
  } finally {
    await lease.release();
  }
}

/** Every sealed form the project stores, with the host key its envelope names. */
export type SealedForms = {
  objects: Array<{ id: string; keyId: string; path: string; bytes: Buffer }>;
  chunks: Array<{ id: string; keyId: string; stored: Buffer }>;
  manifests: Array<{ id: string; keyId: string; text: string }>;
  addressKeys: Array<{ id: string; keyId: string; sealed: Buffer; retired: boolean }>;
};

export async function sealedForms(rootDir: string, pool: AutomationStudioProjectDatabasePool): Promise<SealedForms> {
  const keyOf = (encryption: string): string => (JSON.parse(encryption) as { keyId: string }).keyId;
  return withDatabase(pool, async (database) => {
    const objects = [];
    for (const row of await database.all<{ object_id: string; encryption: string; relative_path: string }>("select object_id, encryption, relative_path from objects where encryption is not null order by object_id")) {
      objects.push({ id: row.object_id, keyId: keyOf(row.encryption), path: row.relative_path, bytes: await readFile(path.join(rootDir, row.relative_path)) });
    }
    const chunks = (await database.all<{ digest: Buffer; encryption: string; stored: Buffer }>("select digest, encryption, stored from client_gateway_trace_chunks order by digest"))
      .map((row) => ({ id: row.digest.toString("hex"), keyId: keyOf(row.encryption), stored: Buffer.from(row.stored) }));
    const manifests = (await database.all<{ trace_id: string; manifest_encryption: string; manifest_json: string }>("select trace_id, manifest_encryption, manifest_json from client_gateway_traces order by trace_id"))
      .map((row) => ({ id: row.trace_id, keyId: keyOf(row.manifest_encryption), text: row.manifest_json }));
    const addressKeys = (await database.all<{ key_id: string; encryption: string; sealed: Buffer; retired_at_ms: number | null }>("select key_id, encryption, sealed, retired_at_ms from content_address_keys order by key_id"))
      .map((row) => ({ id: row.key_id, keyId: keyOf(row.encryption), sealed: Buffer.from(row.sealed), retired: row.retired_at_ms !== null }));
    return { objects, chunks, manifests, addressKeys };
  });
}

/** The host key ids every sealed form names, by kind. */
export function keyIdsByKind(forms: SealedForms): Record<keyof SealedForms, string[]> {
  const ids = (items: Array<{ keyId: string }>): string[] => [...new Set(items.map((item) => item.keyId))].sort();
  return { objects: ids(forms.objects), chunks: ids(forms.chunks), manifests: ids(forms.manifests), addressKeys: ids(forms.addressKeys) };
}

/** Every file under the directory. */
export async function filesUnder(directory: string): Promise<Array<{ name: string; bytes: Buffer }>> {
  const files: Array<{ name: string; bytes: Buffer }> = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesUnder(name)));
    if (entry.isFile()) files.push({ name, bytes: await readFile(name) });
  }
  return files;
}
