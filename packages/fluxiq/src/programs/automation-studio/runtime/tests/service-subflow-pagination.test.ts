import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AutomationStudioFlowSubflow } from "../../model/index.ts";
import { AutomationStudioService } from "../service.ts";

type LegacySubflowIndexEnvelope = {
  version: 1;
  data: {
    schemaVersion: "0.1";
    summaryVersion?: 2;
    subflows: Array<Record<string, unknown>>;
  };
};

type SeededSubflowInventory = {
  dir: string;
  project: Awaited<ReturnType<AutomationStudioService["createProject"]>>;
  flow: Awaited<ReturnType<AutomationStudioService["createFlow"]>>;
  subflows: AutomationStudioFlowSubflow[];
};

// Every case needs a project that already holds N subflows. Writing one through
// the service costs about a third of a second on an idle machine and several
// times that under full-suite load, which used to push the 32- and 64-subflow
// cases past their budgets and then into an EBUSY cascade while cleanup deleted
// a directory the timed-out body was still writing. So the inventories are
// written once, snapshotted after each count a case needs, and each case runs
// on its own copy: a private database per test, and a test body that only
// spends time on the listing it asserts on.
const SEEDED_SUBFLOW_COUNTS = [2, 3, 32, 64] as const;
const SEEDING_TIMEOUT_MS = 180_000;

describe("AutomationStudioService subflow pagination fallbacks", () => {
  const seeded = new Map<number, SeededSubflowInventory>();
  let seedRoot: string | undefined;
  let testRoot: string;
  let dataDir: string;
  let service: AutomationStudioService;
  let opened: AutomationStudioService | undefined;

  beforeAll(async () => {
    seedRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-subflow-pagination-seed-"));
    const liveDir = path.join(seedRoot, "live");
    let seeding = new AutomationStudioService({ dataDir: liveDir, seedFixture: false });
    let seedingOpen = true;
    try {
      const project = await seeding.createProject({ name: "Subflow pagination" });
      const flow = await seeding.createFlow({
        projectId: project.id,
        flowId: "flow.subflow-pagination",
        name: "Subflow pagination"
      });
      const subflows: AutomationStudioFlowSubflow[] = [];
      for (const [position, count] of SEEDED_SUBFLOW_COUNTS.entries()) {
        while (subflows.length < count) {
          const index = subflows.length;
          const created = await seeding.createFlowSubflow({
            projectId: project.id,
            flowId: flow.flowId,
            name: `Subflow ${index}`,
            role: "utility"
          });
          subflows.push(await seeding.saveFlowSubflow({ ...created, createdAt: 10_000 + index, updatedAt: 10_000 + index }));
        }
        // Closing first releases every SQLite handle, so the snapshot is a
        // complete database rather than a copy of a live one.
        await seeding.close();
        seedingOpen = false;
        const dir = path.join(seedRoot, `subflows-${count}`);
        await cp(liveDir, dir, { recursive: true });
        seeded.set(count, { dir, project, flow, subflows: [...subflows] });
        if (position < SEEDED_SUBFLOW_COUNTS.length - 1) {
          seeding = new AutomationStudioService({ dataDir: liveDir, seedFixture: false });
          seedingOpen = true;
        }
      }
    } finally {
      if (seedingOpen) await seeding.close();
    }
  }, SEEDING_TIMEOUT_MS);

  afterAll(async () => {
    if (seedRoot) await rm(seedRoot, { recursive: true, force: true });
  });

  beforeEach(async () => {
    testRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-subflow-pagination-"));
    dataDir = path.join(testRoot, "data");
    opened = undefined;
  });

  afterEach(async () => {
    await opened?.close();
    await rm(testRoot, { recursive: true, force: true });
  });

  async function createSubflows(count: number) {
    const inventory = seeded.get(count);
    if (!inventory) throw new Error(`No seeded inventory holds ${count} subflows; add ${count} to SEEDED_SUBFLOW_COUNTS.`);
    await cp(inventory.dir, dataDir, { recursive: true });
    service = new AutomationStudioService({ dataDir, seedFixture: false });
    opened = service;
    return {
      project: inventory.project,
      flow: inventory.flow,
      subflows: inventory.subflows.map((subflow) => structuredClone(subflow))
    };
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
    const internalService = (service as any).flowMutations as unknown as {
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
    const internalService = (service as any).flows as unknown as {
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
    const internalService = (service as any).flows as unknown as {
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
    const { project, flow, subflows } = await createSubflows(2);
    await downgradeLegacyIndex(project.id);
    await clearSummaryRows(project.id);
    const readDetail = service.getFlowSubflow.bind(service);
    const unavailableSubflowId = subflows[1]!.subflowId;
    service.getFlowSubflow = async (projectId, flowId, subflowId) => subflowId === unavailableSubflowId
      ? null
      : await readDetail(projectId, flowId, subflowId);
    const internalService = (service as any).flows as unknown as { tryWithFlowResourceRepository: () => Promise<null> };
    internalService.tryWithFlowResourceRepository = async () => null;

    const page = await service.listFlowSubflowSummaries({ projectId: project.id, flowId: flow.flowId, limit: 25, offset: 0 });
    const indexFile = path.join(dataDir, "programs", "automation-studio", "projects", project.id, "indexes", "subflows.json");
    const envelope = JSON.parse(await readFile(indexFile, "utf8")) as LegacySubflowIndexEnvelope;

    expect(page.total).toBe(2);
    expect(envelope.data.subflows.map((summary) => summary.subflowId)).toEqual(
      [...subflows]
        .sort((left, right) => (right.updatedAt - left.updatedAt) || left.subflowId.localeCompare(right.subflowId))
        .map((subflow) => subflow.subflowId)
    );
  });
});
