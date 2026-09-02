import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AutomationStudioFlowSubflow } from "../model/index.ts";
import { AutomationStudioService } from "./service.ts";

type LegacySubflowIndexEnvelope = {
  version: 1;
  data: {
    schemaVersion: "0.1";
    summaryVersion?: 2;
    subflows: Array<Record<string, unknown>>;
  };
};

describe("AutomationStudioService subflow pagination fallbacks", () => {
  let dataDir: string;
  let service: AutomationStudioService;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-subflow-pagination-"));
    service = new AutomationStudioService({ dataDir, seedFixture: false });
  });

  afterEach(async () => {
    await service.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  async function createSubflows(count: number) {
    const project = await service.createProject({ name: "Subflow pagination" });
    const flow = await service.createFlow({
      projectId: project.id,
      flowId: "flow.subflow-pagination",
      name: "Subflow pagination"
    });
    for (let index = 0; index < count; index += 1) {
      const subflow: AutomationStudioFlowSubflow = {
        schemaVersion: "0.1",
        subflowId: `subflow.pagination.${String(index).padStart(3, "0")}`,
        projectId: project.id,
        flowId: flow.flowId,
        graphFlowId: `${flow.flowId}.graph.${index}`,
        name: `Subflow ${index}`,
        role: "utility",
        status: "active",
        createdAt: 10_000 + index,
        updatedAt: 10_000 + index
      };
      await service.saveFlowSubflow(subflow);
    }
    return { project, flow };
  }

  async function downgradeLegacyIndex(projectId: string) {
    const indexFile = path.join(
      dataDir,
      "programs",
      "automation-studio",
      "projects",
      projectId,
      "indexes",
      "subflows.json"
    );
    const envelope = JSON.parse(await readFile(indexFile, "utf8")) as LegacySubflowIndexEnvelope;
    delete envelope.data.summaryVersion;
    for (const summary of envelope.data.subflows) delete summary.summaryVersion;
    await writeFile(indexFile, JSON.stringify(envelope), "utf8");
  }

  async function clearSummaryRows(projectId: string) {
    const internalService = service as unknown as {
      flowSubflowSummaryRepository: (id: string) => {
        tableName: string;
        transaction: <T>(scope: object, operation: (transaction: { run: (sql: string) => Promise<unknown> }) => Promise<T>) => Promise<T>;
      };
    };
    const repository = internalService.flowSubflowSummaryRepository(projectId);
    await repository.transaction({}, async (transaction) => await transaction.run(`delete from ${repository.tableName}`));
  }

  it("preserves the summary index version while sorting persisted subflows", async () => {
    const { project } = await createSubflows(2);
    const indexFile = path.join(
      dataDir,
      "programs",
      "automation-studio",
      "projects",
      project.id,
      "indexes",
      "subflows.json"
    );
    const envelope = JSON.parse(await readFile(indexFile, "utf8")) as LegacySubflowIndexEnvelope;

    expect(envelope.data.summaryVersion).toBe(2);
    expect(envelope.data.subflows.every((summary) => summary.summaryVersion === 2)).toBe(true);
  });

  it("does not hydrate a stale legacy index when a typed SQL filter has zero matches", async () => {
    const { project, flow } = await createSubflows(32);
    await downgradeLegacyIndex(project.id);
    let detailReads = 0;
    const readDetail = service.getFlowSubflow.bind(service);
    service.getFlowSubflow = async (...args) => {
      detailReads += 1;
      return await readDetail(...args);
    };

    const page = await service.listFlowSubflowSummaries({
      projectId: project.id,
      flowId: flow.flowId,
      search: "does-not-exist",
      limit: 25,
      offset: 0
    });

    expect(page).toMatchObject({ subflows: [], total: 0, limit: 25, offset: 0 });
    expect(detailReads).toBe(0);
  });

  it("falls back when the typed SQL projection covers only part of the summary inventory", async () => {
    const { project, flow } = await createSubflows(3);
    const internalService = service as unknown as {
      tryWithFlowResourceRepository: () => Promise<{
        items: never[];
        total: number;
        limit: number;
        offset: number;
      }>;
    };
    internalService.tryWithFlowResourceRepository = async () => ({ items: [], total: 1, limit: 25, offset: 0 });

    const page = await service.listFlowSubflowSummaries({ projectId: project.id, flowId: flow.flowId, limit: 25, offset: 0 });

    expect(page.total).toBe(3);
    expect(page.subflows).toHaveLength(3);
  });

  it("bounds concurrent detail hydration when a legacy subflow index must be migrated", async () => {
    const { project, flow } = await createSubflows(64);
    await downgradeLegacyIndex(project.id);
    await clearSummaryRows(project.id);
    const internalService = service as unknown as {
      tryWithFlowResourceRepository: () => Promise<null>;
    };
    internalService.tryWithFlowResourceRepository = async () => null;

    let activeReads = 0;
    let peakReads = 0;
    const readDetail = service.getFlowSubflow.bind(service);
    service.getFlowSubflow = async (...args) => {
      activeReads += 1;
      peakReads = Math.max(peakReads, activeReads);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      try {
        return await readDetail(...args);
      } finally {
        activeReads -= 1;
      }
    };

    const page = await service.listFlowSubflowSummaries({
      projectId: project.id,
      flowId: flow.flowId,
      limit: 25,
      offset: 0
    });

    expect(page).toMatchObject({ total: 64, limit: 25, offset: 0 });
    expect(peakReads).toBeGreaterThan(0);
    expect(peakReads).toBeLessThanOrEqual(16);
  });

  it("preserves a legacy summary when its detail document cannot be hydrated", async () => {
    const { project, flow } = await createSubflows(2);
    await downgradeLegacyIndex(project.id);
    await clearSummaryRows(project.id);
    const readDetail = service.getFlowSubflow.bind(service);
    service.getFlowSubflow = async (projectId, flowId, subflowId) => subflowId.endsWith("001")
      ? null
      : await readDetail(projectId, flowId, subflowId);
    const internalService = service as unknown as { tryWithFlowResourceRepository: () => Promise<null> };
    internalService.tryWithFlowResourceRepository = async () => null;

    const page = await service.listFlowSubflowSummaries({ projectId: project.id, flowId: flow.flowId, limit: 25, offset: 0 });
    const indexFile = path.join(dataDir, "programs", "automation-studio", "projects", project.id, "indexes", "subflows.json");
    const envelope = JSON.parse(await readFile(indexFile, "utf8")) as LegacySubflowIndexEnvelope;

    expect(page.total).toBe(2);
    expect(envelope.data.subflows.map((summary) => summary.subflowId)).toEqual([
      "subflow.pagination.001",
      "subflow.pagination.000"
    ]);
  });
});
