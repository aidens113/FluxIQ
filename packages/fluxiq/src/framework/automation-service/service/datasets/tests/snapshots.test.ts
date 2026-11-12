import { afterEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { AutomationStudioProjectDatasetSnapshotStore, AutomationStudioProjectDatabasePool } from "../../../../persistence/automation/index.ts";
import type { AutomationStudioProjectStore } from "../../projects/index.ts";
import { AutomationStudioRunDatasets } from "../run-datasets.ts";

const pools: AutomationStudioProjectDatabasePool[] = [];
const newPool = () => {
  const pool = new AutomationStudioProjectDatabasePool({ rootDir: path.join(os.tmpdir(), `fluxiq-snapshot-api-${randomUUID()}`) });
  pools.push(pool);
  return pool;
};
afterEach(async () => {
  vi.restoreAllMocks();
  for (const pool of pools.splice(0)) await pool.closeAll();
});

it("the internal snapshot API delegates immutable occurrences and pagination under the requested project", async () => {
  const close = vi.fn(async () => {});
  const create = vi.fn(async () => ({ snapshotId: "snapshot.opaque", count: 1 }));
  const page = vi.fn(async () => ({ snapshotId: "snapshot.opaque", count: 1, rows: [{ occurrenceId: "a", row: { title: "Value" } }] }));
  const backend: Pick<AutomationStudioProjectDatasetSnapshotStore, "create" | "page" | "close"> = { create, page, close };
  // The public methods are checked above; only the real store's private lease is absent in this stand-in.
  const opened = vi.spyOn(AutomationStudioProjectDatasetSnapshotStore, "open").mockResolvedValue(backend as AutomationStudioProjectDatasetSnapshotStore);
  const findProjectSummary = vi.fn(async () => ({}));
  const pool = newPool();
  const service = new AutomationStudioRunDatasets({ findProjectSummary } as unknown as AutomationStudioProjectStore, pool);
  const rows = [{ occurrenceId: "a", row: { title: "Value" } }];
  expect(await service.createImmutableSnapshot({ projectId: "project.one", rows })).toEqual({ snapshotId: "snapshot.opaque", count: 1 });
  expect(create).toHaveBeenCalledWith(rows);
  const request = { projectId: "project.one", snapshotId: "snapshot.opaque", limit: 1 };
  expect(await service.readImmutableSnapshotPage(request)).toMatchObject({ rows });
  expect(page).toHaveBeenCalledWith(request);
  expect(opened).toHaveBeenCalledWith({ projectId: "project.one", pool });
  expect(findProjectSummary).toHaveBeenCalledTimes(2);
  expect(close).toHaveBeenCalledTimes(2);
});

it("a snapshot write/read failure propagates and releases its project lease", async () => {
  const close = vi.fn(async () => {});
  const backend: Pick<AutomationStudioProjectDatasetSnapshotStore, "create" | "page" | "close"> = { create: async () => { throw new Error("write failed"); }, page: async () => { throw new Error("read failed"); }, close };
  vi.spyOn(AutomationStudioProjectDatasetSnapshotStore, "open").mockResolvedValue(backend as AutomationStudioProjectDatasetSnapshotStore);
  const service = new AutomationStudioRunDatasets({ findProjectSummary: async () => ({}) } as unknown as AutomationStudioProjectStore, newPool());
  await expect(service.createImmutableSnapshot({ projectId: "project.one", rows: [] })).rejects.toThrow("write failed");
  await expect(service.readImmutableSnapshotPage({ projectId: "project.one", snapshotId: "snapshot.one" })).rejects.toThrow("read failed");
  expect(close).toHaveBeenCalledTimes(2);
});

it("snapshot operations require project storage and never fabricate a runtime session", async () => {
  const findProjectSummary = vi.fn();
  const service = new AutomationStudioRunDatasets({ findProjectSummary } as unknown as AutomationStudioProjectStore, undefined);
  await expect(service.createImmutableSnapshot({ projectId: "project.one", rows: [] })).rejects.toThrow("require project storage");
  expect(findProjectSummary).not.toHaveBeenCalled();
});
