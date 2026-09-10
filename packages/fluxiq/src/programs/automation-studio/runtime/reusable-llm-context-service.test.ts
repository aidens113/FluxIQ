import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GlobalProgramApiRegistry, type ProgramApiActor } from "../../_shared/api.ts";
import { AUTOMATION_STUDIO_ENDPOINTS } from "../api/contracts.ts";
import { registerAutomationStudioApi } from "../api/handlers.ts";
import { AutomationStudioAesGcmProjectContentProtection, AutomationStudioProjectDatabasePool, AutomationStudioProjectReusableLlmContextStore } from "../storage/index.ts";
import { AutomationStudioService } from "./service.ts";

const rootDir = path.join(process.cwd(), ".tmp", "automation-studio-reusable-llm-context-service-test");
const dataDir = path.join(rootDir, ".fluxiq", "data");
const automationRoot = path.join(dataDir, "programs", "automation-studio");
const actor: ProgramApiActor = { sessionId: "session.one", userId: "user.one", roleId: "admin", permissions: ["programs.read", "flows.write"] };
const contentProtection = new AutomationStudioAesGcmProjectContentProtection(({ projectId }) => ({ keyId: "test.key", key: Buffer.from(projectId.padEnd(32, ".").slice(0, 32)) }));

describe("AutomationStudioService reusable LLM context", () => {
  beforeEach(async () => { await rm(rootDir, { recursive: true, force: true }); await mkdir(rootDir, { recursive: true }); });
  afterEach(async () => rm(rootDir, { recursive: true, force: true }));

  it("is disabled by default and keeps public writes blocked without project content protection", async () => {
    const disabled = new AutomationStudioService({ dataDir });
    expect(disabled.reusableLlmContextStatus()).toMatchObject({ enabled: false, writeEnabled: false, contentProtection: "unavailable" });
    await expect(disabled.listReusableLlmContexts({ projectId: "project.none" })).rejects.toThrow("disabled");
    await disabled.close();

    const enabled = new AutomationStudioService({ dataDir, reusableLlmContext: { enabled: true } });
    expect(enabled.reusableLlmContextStatus()).toMatchObject({ enabled: true, writeEnabled: false, blockerCode: "reusable_context.content_protection_unavailable" });
    await expect(enabled.putReusableLlmContext({ projectId: "project.none", record: write("blocked") })).rejects.toThrow("content protection");
    await enabled.close();
  });

  it("binds an explicit host-owned protection configuration and rejects malformed startup configuration", async () => {
    const service = new AutomationStudioService({ dataDir });
    expect(() => service.bindReusableLlmContext({ enabled: true, contentProtection: { providerId: "", seal: async () => ({ content: Buffer.alloc(0), encryption: "x" }), open: async () => Buffer.alloc(0) }, selectForFreshEvidence: async () => undefined })).toThrow("host configuration is invalid");
    expect(service.reusableLlmContextStatus()).toMatchObject({ enabled: false, writeEnabled: false });
    service.bindReusableLlmContext({ enabled: true, contentProtection, selectForFreshEvidence: async () => undefined });
    expect(service.reusableLlmContextStatus()).toMatchObject({ enabled: true, writeEnabled: true, contentProtection: contentProtection.providerId });
    const project = await service.createProject({ name: "Host protected", domainId: "domain.one" });
    await expect(service.putReusableLlmContext({ projectId: project.id, record: write("host.bound") })).resolves.toMatchObject({ recordId: "host.bound" });
    await service.close();
  });

  it("lists safe summaries, hydrates one authorized detail, packs deterministically, and audits packing", async () => {
    const service = new AutomationStudioService({ dataDir, reusableLlmContext: { enabled: true, contentProtection } });
    expect(service.reusableLlmContextStatus()).toMatchObject({ enabled: true, writeEnabled: true, contentProtection: contentProtection.providerId });
    const project = await service.createProject({ name: "Reusable", domainId: "domain.one" });
    await seed(project.id, [
      write("context.success", { outcome: "succeeded", reviewerState: "approved", promptProjection: { facts: ["success"] } }),
      write("context.failed", { outcome: "failed", promptProjection: { facts: ["failure"] } }),
      write("context.rejected", { outcome: "rejected", promptProjection: { facts: ["rejected"] } })
    ]);
    const summaries = await service.listReusableLlmContexts({ projectId: project.id, flowId: "flow.one", domainId: "domain.one", now: 2_000 });
    expect(summaries).toHaveLength(3);
    expect(summaries[0]).not.toHaveProperty("promptProjection");
    await expect(service.getReusableLlmContext({ projectId: project.id, recordId: "context.success", now: 2_000 })).resolves.toMatchObject({ promptProjection: { facts: ["success"] } });
    const packed = await service.packReusableLlmContexts({ projectId: project.id, flowId: "flow.one", domainId: "domain.one", evidenceKind: "exploration", evidenceSchemaVersion: "evidence.v1", sanitizerVersion: "sanitizer.v1", compatibilityTags: [{ name: "environment", value: "same" }], maxInputTokens: 8_000, actorId: "user.one", now: 2_000 });
    expect(packed.selectedRecordIds).toEqual(["context.success", "context.failed"]);
    const pool = new AutomationStudioProjectDatabasePool({ rootDir: automationRoot });
    const store = await AutomationStudioProjectReusableLlmContextStore.open({ pool, projectId: project.id, enabled: true, contentProtection });
    await expect(store.listAudit({ flowId: "flow.one" })).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ eventType: "packed", actorId: "user.one", detail: expect.objectContaining({ selectedCount: 2 }) })]));
    await store.close(); await pool.closeAll(); await service.close();
  });

  it("enforces authentication, permission, and project-domain scope at API endpoints", async () => {
    const service = new AutomationStudioService({ dataDir, reusableLlmContext: { enabled: true, contentProtection } });
    const project = await service.createProject({ name: "Scoped", domainId: "domain.one" });
    await seed(project.id, [write("context.one"), write("context.foreign", { domainId: "domain.two", ttlMs: 1_000 })]);
    const registry = new GlobalProgramApiRegistry();
    registerAutomationStudioApi(registry, service);
    const unauthenticated = await registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.listReusableLlmContexts, scope: { domainId: "domain.one" }, payload: { projectId: project.id } });
    expect(unauthenticated).toMatchObject({ ok: false, errorCode: "authorization.required" });
    const forbidden = await registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.deleteReusableLlmContext, scope: { domainId: "domain.one" }, actor: { ...actor, permissions: ["programs.read"] }, payload: { projectId: project.id, recordId: "context.one" } });
    expect(forbidden).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
    const wrongDomain = await registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.listReusableLlmContexts, scope: { domainId: "domain.two" }, actor, payload: { projectId: project.id } });
    expect(wrongDomain).toMatchObject({ ok: false, error: expect.stringContaining("domain scope") });
    const foreignContext = await registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.getReusableLlmContext, scope: { domainId: "domain.one" }, actor, payload: { projectId: project.id, recordId: "context.foreign", now: 0 } });
    expect(foreignContext).toMatchObject({ ok: false, error: expect.stringContaining("authorized scope") });
    const listed = await registry.call<any, any>({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.listReusableLlmContexts, scope: { domainId: "domain.one" }, actor, payload: { projectId: project.id, now: 2_000 } });
    expect(listed.payload?.contexts).toMatchObject([{ recordId: "context.one" }]);
    expect(listed.payload?.contexts[0]).not.toHaveProperty("promptProjection");
    const protectedWrite = await registry.call<any, any>({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.putReusableLlmContext, scope: { domainId: "domain.one" }, actor, payload: { projectId: project.id, record: write("new") } });
    expect(protectedWrite).toMatchObject({ ok: true, payload: { context: { recordId: "new", projectId: project.id } } });
    const deleted = await registry.call<any, any>({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.deleteReusableLlmContext, scope: { domainId: "domain.one" }, actor, payload: { projectId: project.id, recordId: "context.one", changedAt: 2_100 } });
    expect(deleted).toMatchObject({ ok: true, payload: { deleted: true } });
    await seed(project.id, [write("context.clear", { flowId: "flow.clear" }), write("context.expired", { flowId: "flow.expired", ttlMs: 1_000 })]);
    const cleared = await registry.call<any, any>({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.clearReusableLlmContextScope, scope: { domainId: "domain.one" }, actor, payload: { projectId: project.id, flowId: "flow.clear", domainId: "domain.one", changedAt: 2_200 } });
    expect(cleared).toMatchObject({ ok: true, payload: { deleted: ["context.clear"] } });
    const purged = await registry.call<any, any>({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.purgeExpiredReusableLlmContexts, scope: { domainId: "domain.one" }, actor, payload: { projectId: project.id, now: 2_500 } });
    expect(purged).toMatchObject({ ok: true, payload: { deleted: ["context.expired"] } });
    await expect(service.getReusableLlmContext({ projectId: project.id, recordId: "context.foreign", now: 0 })).resolves.toMatchObject({ domainId: "domain.two" });
    await service.close();
  });
});

async function seed(projectId: string, records: ReturnType<typeof write>[]): Promise<void> {
  const pool = new AutomationStudioProjectDatabasePool({ rootDir: automationRoot });
  const store = await AutomationStudioProjectReusableLlmContextStore.open({ pool, projectId, enabled: true, contentProtection });
  for (const record of records) await store.put(record, { actorId: "fixture" });
  await store.close(); await pool.closeAll();
}

function write(recordId: string, overrides: Record<string, unknown> = {}) {
  return {
    recordId, flowId: "flow.one", domainId: "domain.one", evidenceKind: "exploration", evidenceSchemaVersion: "evidence.v1", sanitizerVersion: "sanitizer.v1",
    compatibilityTags: [{ name: "environment", value: "same" }], promptProjection: { facts: [recordId] }, createdAt: 1_000, ttlMs: 10_000, ...overrides
  } as any;
}
