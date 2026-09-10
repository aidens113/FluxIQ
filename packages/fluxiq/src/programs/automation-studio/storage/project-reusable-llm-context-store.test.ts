import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationStudioProjectDatabasePool } from "./project-database.ts";
import { AutomationStudioAesGcmProjectContentProtection } from "./project-content-protection.ts";
import {
  AUTOMATION_STUDIO_REUSABLE_LLM_CONTEXT_MAX_PROMPT_BYTES,
  AUTOMATION_STUDIO_REUSABLE_LLM_CONTEXT_MAX_TTL_MS,
  AUTOMATION_STUDIO_REUSABLE_LLM_CONTEXT_VERSION,
  AutomationStudioProjectReusableLlmContextStore,
  type AutomationStudioReusableLlmContextWrite
} from "./project-reusable-llm-context-store.ts";

const rootDir = path.join(process.cwd(), ".tmp", "automation-studio-reusable-llm-context-test");
const contentProtection = new AutomationStudioAesGcmProjectContentProtection(({ projectId }) => ({ keyId: "test.key", key: Buffer.from(projectId.padEnd(32, ".").slice(0, 32)) }));

describe("AutomationStudioProjectReusableLlmContextStore", () => {
  beforeEach(async () => { await rm(rootDir, { recursive: true, force: true }); await mkdir(rootDir, { recursive: true }); });
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

  it("rejects unsafe fields, oversized projections, excessive TTLs, and excessive source IDs", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const store = await AutomationStudioProjectReusableLlmContextStore.open({ pool, projectId: "project.bounds", enabled: true, contentProtection });
    for (const forbidden of ["password", "authToken", "access_token", "cookieJar", "requestHeaders", "rawHtml", "pageSnapshot", "inputValue"]) {
      await expect(store.put(write({ promptProjection: { [forbidden]: "not-storable" } }))).rejects.toThrow("forbidden field");
    }
    await expect(store.put(write({ promptProjection: { text: "x".repeat(2_049) } }))).rejects.toThrow("oversized string");
    await expect(store.put(write({ promptProjection: Array.from({ length: 257 }, (_, index) => index) }))).rejects.toThrow("item limit");
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
    expect(AUTOMATION_STUDIO_REUSABLE_LLM_CONTEXT_MAX_PROMPT_BYTES).toBe(12_288);
    await store.close(); await pool.closeAll();
  });
});

function write(overrides: Partial<AutomationStudioReusableLlmContextWrite> = {}): AutomationStudioReusableLlmContextWrite {
  return {
    recordId: "context.1", flowId: "flow.1", subflowId: "subflow.1", domainId: "domain.example",
    evidenceKind: "exploration", evidenceSchemaVersion: "evidence.v1", sanitizerVersion: "sanitizer.v1",
    promptProjection: { facts: ["safe"] }, createdAt: 1_000, ttlMs: 1_000, ...overrides
  };
}
