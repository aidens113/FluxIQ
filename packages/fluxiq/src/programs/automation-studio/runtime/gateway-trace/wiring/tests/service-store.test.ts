// @fluxiq-test-group real-sql
// The trace store the host's episodes write a project's traces through, read
// by the service that owns the pool (trace plan P5, `../service-store.ts`): a
// host outside the web process reads a recorded trace exactly as the host
// wrote it, over the service's own per-project pool and its protection. A
// service without project storage has none.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AutomationStudioService } from "../../../service.ts";
import { AutomationStudioGatewayTraceProjectStore, AutomationStudioGatewayTraceServicePools, automationStudioGatewayTraceServiceStore } from "../index.ts";

const PROJECT = "project.service-store";
const TRACE = "trace.service-store";
const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

describe("a service's gateway trace store for a project", () => {
  it("writes and reads through the service's own pool, as the host's store for that project does", async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), "automation-studio-gateway-trace-service-store-"));
    const service = new AutomationStudioService({ dataDir, seedFixture: false });
    cleanups.push(() => rm(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 }));
    cleanups.push(() => service.close());

    const store = automationStudioGatewayTraceServiceStore(service, PROJECT);
    expect(store).toBeInstanceOf(AutomationStudioGatewayTraceProjectStore);
    await store!.writeArtifact(TRACE, "artifact.1", new Uint8Array([1, 2, 3]));

    const pool = AutomationStudioGatewayTraceServicePools.of(service)!;
    const host = new AutomationStudioGatewayTraceProjectStore({ pool, projectId: PROJECT, protection: AutomationStudioGatewayTraceServicePools.protectionOf(pool) });
    expect(Array.from((await host.readArtifact(TRACE, "artifact.1")) ?? [])).toEqual([1, 2, 3]);
  });

  it("is absent for an owner without project storage", () => {
    expect(automationStudioGatewayTraceServiceStore({}, PROJECT)).toBeUndefined();
  });
});
