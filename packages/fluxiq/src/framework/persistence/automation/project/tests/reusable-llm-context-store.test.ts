// @fluxiq-test-group real-sql
import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationStudioProjectDatabasePool } from "../database.ts";
import { AutomationStudioAesGcmProjectContentProtection } from "../content-protection.ts";
import {
  AUTOMATION_STUDIO_REUSABLE_LLM_CONTEXT_MAX_TTL_MS,
  AUTOMATION_STUDIO_REUSABLE_LLM_CONTEXT_VERSION,
  AutomationStudioProjectReusableLlmContextStore,
  type AutomationStudioReusableLlmContextWrite
} from "../reusable-llm-context-store.ts";
import { rotateAutomationStudioContentAddressKey } from "../content-address/index.ts";

// Its own directory per case: a fixed path under the working directory was
// shared by every run of this file in the checkout, so two runs at once
// deleted and overwrote each other's data.
let rootDir = "";
const contentProtection = new AutomationStudioAesGcmProjectContentProtection(({ projectId }) => ({ keyId: "test.key", key: Buffer.from(projectId.padEnd(32, ".").slice(0, 32)) }));

describe("AutomationStudioProjectReusableLlmContextStore", () => {
  beforeEach(async () => { rootDir = await mkdtemp(path.join(os.tmpdir(), "automation-studio-reusable-llm-context-test-")); });
  afterEach(async () => rm(rootDir, { recursive: true, force: true }));

  it("is feature-off by default without changing existing-project behavior", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const store = await AutomationStudioProjectReusableLlmContextStore.open({ pool, projectId: "project.off" });
    await expect(store.list()).resolves.toEqual([]);
    await expect(store.get("context.missing")).resolves.toBeNull();
    await expect(store.put(write())).rejects.toThrow("disabled");
    await expect(store.purgeExpired()).resolves.toEqual({ deleted: [] });
    await store.close();
    await pool.closeAll();
  });

  it("fails closed when enabled without project content protection", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const store = await AutomationStudioProjectReusableLlmContextStore.open({ pool, projectId: "project.unprotected", enabled: true });
    await expect(store.put(write())).rejects.toThrow("require project content protection");
    await store.close(); await pool.closeAll();
  });

  it("persists a bounded canonical projection with scope, provenance, compatibility, and disposition", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const store = await AutomationStudioProjectReusableLlmContextStore.open({ pool, projectId: "project.one", enabled: true, contentProtection });
    const saved = await store.put(write({
      compatibilityTags: [{ name: "registry", value: "v2" }, { name: "graph", value: "sha256.abc" }],
      promptProjection: { z: "last", facts: [{ state: "stable" }], a: true },
      sourceRunIds: ["run.2", "run.1", "run.1"], sourceAdaptationIds: ["adaptation.1"], outcome: "succeeded", reviewerState: "approved"
    }));
    expect(saved).toMatchObject({
      contractVersion: AUTOMATION_STUDIO_REUSABLE_LLM_CONTEXT_VERSION, recordId: "context.1", projectId: "project.one",
      flowId: "flow.1", subflowId: "subflow.1", domainId: "domain.example", evidenceKind: "exploration",
      evidenceSchemaVersion: "evidence.v1", sanitizerVersion: "sanitizer.v1", outcome: "succeeded", reviewerState: "approved", validationState: "unknown",
      sourceRunIds: ["run.1", "run.2"], sourceAdaptationIds: ["adaptation.1"], createdAt: 1_000, lastUsedAt: 1_000, expiresAt: 2_000
    });
    expect(saved.compatibilityTags).toEqual([{ name: "graph", value: "sha256.abc" }, { name: "registry", value: "v2" }]);
    expect(saved.byteCount).toBe(Buffer.byteLength(JSON.stringify(saved.promptProjection)));
    expect(saved.contentDigest).toMatch(/^[a-f0-9]{64}$/u);
    await store.put(write({ recordId: "context.newer-nonmatch", createdAt: 1_200, compatibilityTags: [{ name: "graph", value: "sha256.other" }] }));
    await expect(store.list({ flowId: "flow.1", domainId: "domain.example", compatibilityTags: [{ name: "graph", value: "sha256.abc" }], now: 1_500, limit: 1 })).resolves.toMatchObject([{ recordId: "context.1" }]);
    await expect(store.list({ compatibilityTags: [{ name: "graph", value: "sha256.abc" }], compatibilityMode: "exact", now: 1_500 })).resolves.toEqual([]);
    await expect(store.list({ compatibilityTags: saved.compatibilityTags, compatibilityMode: "exact", now: 1_500 })).resolves.toMatchObject([{ recordId: "context.1" }]);
    await expect(store.list({ compatibilityTags: [{ name: "graph", value: "other" }], now: 1_500 })).resolves.toEqual([]);
    expect((await store.get("context.1", { now: 1_500, touch: true }))?.lastUsedAt).toBe(1_500);
    expect((await store.get("context.1", { now: 1_500 }))?.expiresAt).toBe(2_000);
    await expect(store.updateDisposition("context.1", { outcome: "rejected", reviewerState: "rejected", validationState: "validated" })).resolves.toBe(true);
    await expect(store.get("context.1", { now: 1_500 })).resolves.toMatchObject({ outcome: "rejected", reviewerState: "rejected", validationState: "validated" });
    await expect(store.delete("context.1", { actorId: "reviewer.one", changedAt: 1_600 })).resolves.toBe(true);
    await expect(store.listAudit({ recordId: "context.1" })).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ eventType: "created" }), expect.objectContaining({ eventType: "disposition_changed" }),
      expect.objectContaining({ eventType: "deleted", actorId: "reviewer.one" })
    ]));
    await store.close();
    await pool.closeAll();
  });

  it("isolates identical record IDs by project and filters, purges, clears, and deletes by exact scope", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const one = await AutomationStudioProjectReusableLlmContextStore.open({ pool, projectId: "project.one", enabled: true, contentProtection });
    const two = await AutomationStudioProjectReusableLlmContextStore.open({ pool, projectId: "project.two", enabled: true, contentProtection });
    await one.put(write({ promptProjection: { project: "one" } }));
    await two.put(write({ promptProjection: { project: "two" } }));
    const rootScoped = write({ recordId: "context.root", createdAt: 1_100, ttlMs: 1_000 });
    delete rootScoped.subflowId;
    await one.put(rootScoped);
    expect((await one.get("context.1", { now: 1_500 }))?.promptProjection).toEqual({ project: "one" });
    expect((await two.get("context.1", { now: 1_500 }))?.promptProjection).toEqual({ project: "two" });
    await expect(one.purgeExpired({ now: 2_001 })).resolves.toEqual({ deleted: ["context.1"] });
    await expect(one.get("context.1", { now: 2_001 })).resolves.toBeNull();
    await expect(two.get("context.1", { now: 2_001 })).resolves.toBeNull();
    await expect(one.clearScope({ flowId: "flow.1", subflowId: null })).resolves.toEqual({ deleted: ["context.root"] });
    await expect(one.listAudit()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ eventType: "expired_purged", detail: { deletedCount: 1 } }),
      expect.objectContaining({ eventType: "scope_cleared", detail: { deletedCount: 1 } })
    ]));
    await one.close(); await two.close(); await pool.closeAll();
  });

  it("rejects unsafe fields, excessive TTLs, and excessive source IDs, and stores a large projection whole", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const store = await AutomationStudioProjectReusableLlmContextStore.open({ pool, projectId: "project.bounds", enabled: true, contentProtection });
    for (const forbidden of ["password", "authToken", "access_token", "cookieJar", "requestHeaders", "rawHtml", "pageSnapshot", "inputValue"]) {
      await expect(store.put(write({ promptProjection: { [forbidden]: "not-storable" } }))).rejects.toThrow("forbidden field");
    }
    // A projection is stored whole: no string, item or byte limit.
    await expect(store.put(write({ recordId: "context.long-string", promptProjection: { text: "x".repeat(20_000) } }))).resolves.toMatchObject({ recordId: "context.long-string" });
    await expect(store.put(write({ recordId: "context.many-items", promptProjection: Array.from({ length: 2_000 }, (_, index) => index) }))).resolves.toMatchObject({ recordId: "context.many-items" });
    await expect(store.put(write({ ttlMs: AUTOMATION_STUDIO_REUSABLE_LLM_CONTEXT_MAX_TTL_MS + 1 }))).rejects.toThrow("ttlMs");
    await expect(store.put(write({ sourceRunIds: Array.from({ length: 26 }, (_, index) => `run.${index}`) }))).rejects.toThrow("item limit");
    await expect(store.put(write({
      recordId: "context.safe-shape",
      promptProjection: {
        schemaVersion: "web-evidence.v1", sanitizerVersion: "web-sanitizer.v1", compatibilityDigest: "sha256.safe",
        location: { origin: "https://example.test", path: "/form" }, facts: [{ elementKind: "control", actionKind: "type" }],
        truncated: false, digest: "sha256.packet", byteCount: 512
      }
    }))).resolves.toMatchObject({ recordId: "context.safe-shape" });
    await store.close(); await pool.closeAll();
  });

  // What a model is offered reads every record (2026-09-30): it read one page of 100.
  it("pages by offset, and listEvery reads every page in the list's order", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const store = await AutomationStudioProjectReusableLlmContextStore.open({ pool, projectId: "project.pages", enabled: true, contentProtection });
    for (let index = 0; index < 120; index += 1) {
      await store.put(write({ recordId: `context.${String(index).padStart(3, "0")}`, createdAt: 1_000 + index, promptProjection: { facts: [index] } }));
    }
    const newestFirst = Array.from({ length: 120 }, (_, index) => `context.${String(119 - index).padStart(3, "0")}`);
    expect((await store.list({ now: 1_500, limit: 100, offset: 100 })).map((record) => record.recordId)).toEqual(newestFirst.slice(100));
    expect((await store.listEvery({ now: 1_500 })).map((record) => record.recordId)).toEqual(newestFirst);
    await expect(store.list({ now: 1_500, offset: -1 })).rejects.toThrow("offset");
    await store.close(); await pool.closeAll();
    // 120 encrypted writes, each audited: slower than the file's other cases.
  }, 60_000);
});

describe("AutomationStudioProjectReusableLlmContextStore keyed content digests (t745)", () => {
  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(os.tmpdir(), "automation-studio-reusable-llm-context-digest-test-"));
  });
  afterEach(async () => rm(rootDir, { recursive: true, force: true }));

  it("stores a fresh put's digest keyed under the current key and reads it back", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const store = await AutomationStudioProjectReusableLlmContextStore.open({ pool, projectId: "project.keyed", enabled: true, contentProtection: sharedHostProtection });
    const saved = await store.put(write({ promptProjection: { facts: ["keyed"] } }));
    expect(saved.contentDigest).toMatch(/^[a-f0-9]{64}$/u);
    expect(saved.contentDigest).not.toBe(plainDigest(saved.promptProjection));
    const row = await digestRow(pool, "project.keyed", "context.1");
    expect(row).toEqual({ digest: saved.contentDigest, keyId: await currentKeyId(pool, "project.keyed") });
    const read = await store.get("context.1", { now: 1_500 });
    expect(read?.promptProjection).toEqual({ facts: ["keyed"] });
    expect(read?.contentDigest).toBe(saved.contentDigest);
    await store.close();
    await pool.closeAll();
  });

  it("gives equal projections one digest within a project and different digests across projects under one host key", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const one = await AutomationStudioProjectReusableLlmContextStore.open({ pool, projectId: "project.one", enabled: true, contentProtection: sharedHostProtection });
    const two = await AutomationStudioProjectReusableLlmContextStore.open({ pool, projectId: "project.two", enabled: true, contentProtection: sharedHostProtection });
    const first = await one.put(write({ recordId: "context.a" }));
    const second = await one.put(write({ recordId: "context.b" }));
    const other = await two.put(write({ recordId: "context.a" }));
    expect(second.contentDigest).toBe(first.contentDigest);
    expect(other.contentDigest).not.toBe(first.contentDigest);
    await one.close();
    await two.close();
    await pool.closeAll();
  });

  it("leaves the plain SHA-256 of a projection nowhere in the database or object files", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const store = await AutomationStudioProjectReusableLlmContextStore.open({ pool, projectId: "project.probe", enabled: true, contentProtection: sharedHostProtection });
    const saved = await store.put(write({ promptProjection: { facts: ["a guessable projection"], step: 7 } }));
    await store.close();
    await pool.closeAll();
    const plain = createHash("sha256").update(JSON.stringify(saved.promptProjection), "utf8").digest();
    const files = await filesUnder(path.join(rootDir, "projects", "project.probe"));
    expect(files.some((file) => file.endsWith("project.sqlite"))).toBe(true);
    for (const file of files) {
      const bytes = await readFile(file);
      expect(bytes.includes(Buffer.from(plain.toString("hex"), "utf8")), file).toBe(false);
      expect(bytes.includes(plain), file).toBe(false);
    }
  });

  it("rekeys rows written with a plain digest on the next protected open, and reads verify", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const projectId = "project.migrated";
    await putRecords(pool, projectId, 3);
    await rewriteAsOlderCode(pool, projectId);
    const reopened = await AutomationStudioProjectReusableLlmContextStore.open({ pool, projectId, enabled: true, contentProtection: sharedHostProtection });
    expect(reopened.digestRekey).toEqual({ rekeyed: 3, skipped: 0, batches: 1, complete: true });
    const keyId = await currentKeyId(pool, projectId);
    for (const recordId of ["context.0", "context.1", "context.2"]) {
      const row = await digestRow(pool, projectId, recordId);
      expect(row?.keyId).toBe(keyId);
      const record = await reopened.get(recordId, { now: 1_500 });
      expect(record?.contentDigest).toBe(row?.digest);
      expect(record?.contentDigest).not.toBe(plainDigest(record?.promptProjection));
    }
    await reopened.close();
    await pool.closeAll();
  });

  it("scrubs after rekeying a migrated store, leaving no plain SHA-256 of a projection in any file (t745 u5)", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const projectId = "project.migrated-probe";
    await putRecords(pool, projectId, 3);
    await rewriteAsOlderCode(pool, projectId);
    const plain = [0, 1, 2].map((index) => createHash("sha256").update(JSON.stringify({ facts: [index] }), "utf8").digest());
    const projectFiles = path.join(rootDir, "projects", projectId);
    const leaks = async (): Promise<string[]> => {
      const hits: string[] = [];
      for (const file of await filesUnder(projectFiles)) {
        const bytes = await readFile(file);
        for (const digest of plain) {
          if (bytes.includes(Buffer.from(digest.toString("hex"), "utf8")) || bytes.includes(digest)) hits.push(path.basename(file));
        }
      }
      return hits;
    };
    expect((await leaks()).length).toBeGreaterThan(0);

    const reopened = await AutomationStudioProjectReusableLlmContextStore.open({ pool, projectId, enabled: true, contentProtection: sharedHostProtection });
    expect(reopened.digestRekey).toEqual({ rekeyed: 3, skipped: 0, batches: 1, complete: true });
    expect(reopened.scrub).toMatchObject({ status: "done", checkpoint: { busy: 0 } });
    expect(await leaks()).toEqual([]);
    await reopened.close();
    await pool.closeAll();
    expect(await leaks()).toEqual([]);

    const later = new AutomationStudioProjectDatabasePool({ rootDir });
    const again = await AutomationStudioProjectReusableLlmContextStore.open({ pool: later, projectId, enabled: true, contentProtection: sharedHostProtection });
    expect(again.scrub).toEqual({ status: "not-requested" });
    await again.close();
    await later.closeAll();
  });

  it("resumes an interrupted rekey on the next open, reading mixed forms in between", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const projectId = "project.interrupted";
    await putRecords(pool, projectId, 5);
    await rewriteAsOlderCode(pool, projectId);
    const partial = await AutomationStudioProjectReusableLlmContextStore.open({ pool, projectId, enabled: true, contentProtection: sharedHostProtection, digestRekey: { batchSize: 2, maxBatches: 1 } });
    expect(partial.digestRekey).toEqual({ rekeyed: 2, skipped: 0, batches: 1, complete: false });
    expect(await plainRowCount(pool, projectId)).toBe(3);
    expect(await partial.listEvery({ now: 1_500 })).toHaveLength(5);
    await partial.close();
    const resumed = await AutomationStudioProjectReusableLlmContextStore.open({ pool, projectId, enabled: true, contentProtection: sharedHostProtection });
    expect(resumed.digestRekey).toEqual({ rekeyed: 3, skipped: 0, batches: 1, complete: true });
    expect(await plainRowCount(pool, projectId)).toBe(0);
    expect(await resumed.listEvery({ now: 1_500 })).toHaveLength(5);
    await resumed.close();
    await pool.closeAll();
  });

  it("fails the read of a tampered digest in either form, and the rekey skips a plain row that does not verify", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const projectId = "project.tampered";
    await putRecords(pool, projectId, 2);
    await setDigest(pool, projectId, "context.0", "a".repeat(64), "keep");
    const store = await AutomationStudioProjectReusableLlmContextStore.open({ pool, projectId, enabled: true, contentProtection: sharedHostProtection });
    await expect(store.get("context.0", { now: 1_500 })).rejects.toThrow("Reusable LLM context content metadata mismatch.");
    await expect(store.get("context.1", { now: 1_500 })).resolves.toMatchObject({ recordId: "context.1" });
    await store.close();
    await setDigest(pool, projectId, "context.1", "b".repeat(64), null);
    const reopened = await AutomationStudioProjectReusableLlmContextStore.open({ pool, projectId, enabled: true, contentProtection: sharedHostProtection });
    expect(reopened.digestRekey).toEqual({ rekeyed: 0, skipped: 1, batches: 1, complete: true });
    expect(await digestRow(pool, projectId, "context.1")).toEqual({ digest: "b".repeat(64), keyId: null });
    await expect(reopened.get("context.1", { now: 1_500 })).rejects.toThrow("Reusable LLM context content metadata mismatch.");
    await reopened.close();
    await pool.closeAll();
  });

  it("rekeys under the new key after a key rotation", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const projectId = "project.rotated";
    await putRecords(pool, projectId, 2);
    const before = await digestRow(pool, projectId, "context.0");
    const lease = await pool.acquire(projectId);
    const rotated = await rotateAutomationStudioContentAddressKey({ database: lease.database, projectId, protection: sharedHostProtection });
    await lease.release();
    const reopened = await AutomationStudioProjectReusableLlmContextStore.open({ pool, projectId, enabled: true, contentProtection: sharedHostProtection });
    expect(reopened.digestRekey).toEqual({ rekeyed: 2, skipped: 0, batches: 1, complete: true });
    const after = await digestRow(pool, projectId, "context.0");
    expect(after?.keyId).toBe(rotated.keyId);
    expect(after?.keyId).not.toBe(before?.keyId);
    expect(after?.digest).not.toBe(before?.digest);
    await expect(reopened.get("context.0", { now: 1_500 })).resolves.toMatchObject({ contentDigest: after?.digest });
    await reopened.close();
    await pool.closeAll();
  });
});

/** One host key for every project, as a host that shares one key would bind. */
const sharedHostProtection = new AutomationStudioAesGcmProjectContentProtection(() => ({ keyId: "host.shared", key: Buffer.alloc(32, 7) }));

type DigestRow = { digest: string; keyId: string | null };

function plainDigest(projection: unknown): string {
  return createHash("sha256").update(JSON.stringify(projection), "utf8").digest("hex");
}

async function putRecords(pool: AutomationStudioProjectDatabasePool, projectId: string, count: number): Promise<void> {
  const store = await AutomationStudioProjectReusableLlmContextStore.open({ pool, projectId, enabled: true, contentProtection: sharedHostProtection });
  for (let index = 0; index < count; index += 1) {
    await store.put(write({ recordId: `context.${index}`, promptProjection: { facts: [index] } }));
  }
  await store.close();
}

/** What code before 0035 wrote: the plain SHA-256 of the projection and no key id. */
async function rewriteAsOlderCode(pool: AutomationStudioProjectDatabasePool, projectId: string): Promise<void> {
  const lease = await pool.acquire(projectId);
  const rows = await lease.database.all<{ recordId: string }>("select record_id as recordId from reusable_llm_contexts");
  for (const row of rows) {
    const index = Number(row.recordId.slice("context.".length));
    await lease.database.run("update reusable_llm_contexts set content_digest = ?, content_digest_key_id = null where record_id = ?", [plainDigest({ facts: [index] }), row.recordId]);
  }
  await lease.release();
}

async function setDigest(pool: AutomationStudioProjectDatabasePool, projectId: string, recordId: string, digest: string, keyId: string | null | "keep"): Promise<void> {
  const lease = await pool.acquire(projectId);
  if (keyId === "keep") {
    await lease.database.run("update reusable_llm_contexts set content_digest = ? where record_id = ?", [digest, recordId]);
  } else {
    await lease.database.run("update reusable_llm_contexts set content_digest = ?, content_digest_key_id = ? where record_id = ?", [digest, keyId, recordId]);
  }
  await lease.release();
}

async function digestRow(pool: AutomationStudioProjectDatabasePool, projectId: string, recordId: string): Promise<DigestRow | undefined> {
  const lease = await pool.acquire(projectId);
  const row = await lease.database.get<DigestRow>("select content_digest as digest, content_digest_key_id as keyId from reusable_llm_contexts where record_id = ?", [recordId]);
  await lease.release();
  return row;
}

async function plainRowCount(pool: AutomationStudioProjectDatabasePool, projectId: string): Promise<number> {
  const lease = await pool.acquire(projectId);
  const row = await lease.database.get<{ count: number }>("select count(*) as count from reusable_llm_contexts where content_digest_key_id is null");
  await lease.release();
  return row?.count ?? 0;
}

async function currentKeyId(pool: AutomationStudioProjectDatabasePool, projectId: string): Promise<string | undefined> {
  const lease = await pool.acquire(projectId);
  const row = await lease.database.get<{ keyId: string }>("select key_id as keyId from content_address_keys where retired_at_ms is null");
  await lease.release();
  return row?.keyId;
}

async function filesUnder(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true, recursive: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => path.join(entry.parentPath, entry.name));
}

function write(overrides: Partial<AutomationStudioReusableLlmContextWrite> = {}): AutomationStudioReusableLlmContextWrite {
  return {
    recordId: "context.1", flowId: "flow.1", subflowId: "subflow.1", domainId: "domain.example",
    evidenceKind: "exploration", evidenceSchemaVersion: "evidence.v1", sanitizerVersion: "sanitizer.v1",
    promptProjection: { facts: ["safe"] }, createdAt: 1_000, ttlMs: 1_000, ...overrides
  };
}
