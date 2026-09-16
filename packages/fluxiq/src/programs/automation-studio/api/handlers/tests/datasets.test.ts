// Covers handlers/datasets.ts. The security property under test is that every
// dataset handler asserts the project's domain access *before* it reads
// anything (CD16): a domain mismatch must reject with the collaborator never
// called, not merely filter the answer afterwards.
//
// The collaborator is stubbed. `service.runDatasets` is wired onto the real
// service by K4c; these cases pin the handler contract, not that wiring.

import { describe, expect, it, vi } from "vitest";

import { GlobalProgramApiRegistry } from "../../../../_shared/api.ts";

import { AUTOMATION_STUDIO_ENDPOINTS } from "../../contracts.ts";
import type { AutomationStudioService } from "../../../runtime/index.ts";
import { cacheActor } from "./test-actor.ts";
import { registerAutomationStudioApi } from "../index.ts";

const DOMAIN_REFUSED = "Automation Studio project is unavailable in this domain scope.";

function datasetService(overrides: Record<string, unknown> = {}) {
  const runDatasets = {
    listRunDatasets: vi.fn().mockResolvedValue([]),
    getRunDatasetPage: vi.fn().mockResolvedValue(null),
    exportRunDataset: vi.fn().mockResolvedValue(null),
    deleteRunDatasets: vi.fn().mockResolvedValue({ datasetCount: 0, rowCount: 0 }),
    listProjectDatasets: vi.fn().mockResolvedValue({ datasets: [], nextCursor: null }),
    listDatasetRuns: vi.fn().mockResolvedValue({ runs: [], nextCursor: null }),
    ...overrides
  };
  const assertProjectDomainAccess = vi.fn().mockResolvedValue(undefined);
  // Deleting a run's captured rows is destructive, so the registry takes the
  // operator's PIN before the handler runs. Every other dataset endpoint reads.
  const authorizeSessionPin = vi.fn().mockResolvedValue({ authorized: true });
  const registry = new GlobalProgramApiRegistry({ identityAccess: { authorizeSessionPin } as never });
  registerAutomationStudioApi(registry, { assertProjectDomainAccess, runDatasets } as unknown as AutomationStudioService);
  return { registry, runDatasets, assertProjectDomainAccess, authorizeSessionPin };
}

const readActor = { ...cacheActor("user.reader"), permissions: ["programs.read" as const] };
const writeActor = { ...cacheActor("user.writer"), permissions: ["flows.write" as const] };

// One representative call per endpoint, with the collaborator method it must reach.
const DATASET_ENDPOINTS = [
  { endpoint: AUTOMATION_STUDIO_ENDPOINTS.listRunDatasets, method: "listRunDatasets", permission: "programs.read", classification: "read", actor: readActor, payload: { projectId: "project.one", runId: "run.one" } },
  { endpoint: AUTOMATION_STUDIO_ENDPOINTS.getRunDatasetPage, method: "getRunDatasetPage", permission: "programs.read", classification: "read", actor: readActor, payload: { projectId: "project.one", runId: "run.one", datasetId: "listings" } },
  { endpoint: AUTOMATION_STUDIO_ENDPOINTS.exportRunDataset, method: "exportRunDataset", permission: "programs.read", classification: "read", actor: readActor, payload: { projectId: "project.one", runId: "run.one", datasetId: "listings", format: "csv" } },
  { endpoint: AUTOMATION_STUDIO_ENDPOINTS.deleteRunDatasets, method: "deleteRunDatasets", permission: "flows.write", classification: "destructive", actor: writeActor, payload: { projectId: "project.one", runId: "run.one", authSessionId: "session.user.writer", authorizationPin: "123456" } },
  { endpoint: AUTOMATION_STUDIO_ENDPOINTS.listProjectDatasets, method: "listProjectDatasets", permission: "programs.read", classification: "read", actor: readActor, payload: { projectId: "project.one" } },
  { endpoint: AUTOMATION_STUDIO_ENDPOINTS.listDatasetRuns, method: "listDatasetRuns", permission: "programs.read", classification: "read", actor: readActor, payload: { projectId: "project.one", flowId: "flow.listings", datasetId: "listings" } }
] as const;

describe("Automation Studio run dataset API", () => {
  it("registers every dataset endpoint under its permission and classification", () => {
    const { registry } = datasetService();
    for (const { endpoint, permission, classification } of DATASET_ENDPOINTS) {
      expect(registry.endpoints()).toContainEqual({ programId: "automation-studio", endpoint, permission, classification });
    }
  });

  it("asserts the project's domain access before reading anything, on every endpoint", async () => {
    for (const { endpoint, method, actor, payload } of DATASET_ENDPOINTS) {
      const { registry, runDatasets, assertProjectDomainAccess } = datasetService();
      assertProjectDomainAccess.mockRejectedValue(new Error(DOMAIN_REFUSED));

      const response = await registry.call({ programId: "automation-studio", endpoint, scope: { domainId: "other-domain" }, actor, payload });

      expect(response, `${endpoint} must refuse a domain mismatch`).toMatchObject({ ok: false, error: DOMAIN_REFUSED });
      expect(assertProjectDomainAccess).toHaveBeenCalledWith("project.one", "other-domain");
      expect(runDatasets[method as keyof typeof runDatasets], `${endpoint} must not read after a domain mismatch`).not.toHaveBeenCalled();
    }
  });

  it("refuses an actor without the endpoint's permission before the handler runs", async () => {
    for (const { endpoint, method, permission } of DATASET_ENDPOINTS) {
      const { registry, runDatasets, assertProjectDomainAccess } = datasetService();
      const wrongActor = permission === "flows.write" ? readActor : writeActor;

      const response = await registry.call({ programId: "automation-studio", endpoint, scope: {}, actor: wrongActor, payload: { projectId: "project.one", runId: "run.one" } });

      expect(response, `${endpoint} requires ${permission}`).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
      expect(assertProjectDomainAccess).not.toHaveBeenCalled();
      expect(runDatasets[method as keyof typeof runDatasets]).not.toHaveBeenCalled();
    }
  });

  it("clamps the page limit to 1-200 and defaults it to 50", async () => {
    const cases = [
      { requested: undefined, expected: 50 },
      { requested: 25, expected: 25 },
      { requested: 5_000, expected: 200 },
      { requested: 0, expected: 1 },
      { requested: "not-a-number", expected: 50 }
    ];
    for (const { requested, expected } of cases) {
      const { registry, runDatasets } = datasetService();
      await registry.call({
        programId: "automation-studio",
        endpoint: AUTOMATION_STUDIO_ENDPOINTS.getRunDatasetPage,
        scope: {},
        actor: readActor,
        payload: { projectId: "project.one", runId: "run.one", datasetId: "listings", limit: requested }
      });
      expect(runDatasets.getRunDatasetPage, `limit ${String(requested)}`).toHaveBeenCalledWith(expect.objectContaining({ limit: expected }));
    }
  });

  it("echoes the clamped limit in the Data window's page envelopes", async () => {
    const { registry, runDatasets } = datasetService({
      listProjectDatasets: vi.fn().mockResolvedValue({ datasets: [{ flowId: "flow.listings", datasetId: "listings" }], nextCursor: "cursor.next" })
    });

    const response = await registry.call({
      programId: "automation-studio",
      endpoint: AUTOMATION_STUDIO_ENDPOINTS.listProjectDatasets,
      scope: {},
      actor: readActor,
      payload: { projectId: "project.one", limit: 5_000 }
    });

    expect(response).toEqual({ ok: true, payload: { datasets: [{ flowId: "flow.listings", datasetId: "listings" }], page: { nextCursor: "cursor.next", limit: 200 } } });
    expect(runDatasets.listProjectDatasets).toHaveBeenCalledWith(expect.objectContaining({ projectId: "project.one", limit: 200, flowId: undefined, search: undefined }));
  });

  it("answers { dataset: null } for a dataset the run never stored", async () => {
    const { registry } = datasetService();
    const response = await registry.call({
      programId: "automation-studio",
      endpoint: AUTOMATION_STUDIO_ENDPOINTS.getRunDatasetPage,
      scope: {},
      actor: readActor,
      payload: { projectId: "project.one", runId: "run.one", datasetId: "missing" }
    });
    expect(response).toEqual({ ok: true, payload: { dataset: null } });
  });

  it("returns an inline export body and names the signed-in actor for the audit event", async () => {
    const inline = { tooLarge: false, format: "csv", fileName: "fluxiq-dataset-run.one-listings.csv", contentType: "text/csv; charset=utf-8", body: "Title\r\n'=1+1\r\n", rowCount: 1, byteCount: 15 };
    const { registry, runDatasets } = datasetService({ exportRunDataset: vi.fn().mockResolvedValue(inline) });

    const response = await registry.call({
      programId: "automation-studio",
      endpoint: AUTOMATION_STUDIO_ENDPOINTS.exportRunDataset,
      scope: {},
      actor: readActor,
      payload: { projectId: "project.one", runId: "run.one", datasetId: "listings", format: "csv" }
    });

    expect(response).toEqual({ ok: true, payload: { export: inline } });
    expect(runDatasets.exportRunDataset).toHaveBeenCalledWith({ projectId: "project.one", runId: "run.one", datasetId: "listings", format: "csv", actorId: "user.reader" });
  });

  it("passes a tooLarge export through with its streaming path", async () => {
    const tooLarge = { tooLarge: true, format: "json", rowCount: 40_000, downloadPath: "/api/programs/automation-studio/run-datasets/project.one/run.one/listings?format=json" };
    const { registry } = datasetService({ exportRunDataset: vi.fn().mockResolvedValue(tooLarge) });

    const response = await registry.call({
      programId: "automation-studio",
      endpoint: AUTOMATION_STUDIO_ENDPOINTS.exportRunDataset,
      scope: {},
      actor: readActor,
      payload: { projectId: "project.one", runId: "run.one", datasetId: "listings", format: "json" }
    });

    expect(response).toEqual({ ok: true, payload: { export: tooLarge } });
  });

  it("deletes one dataset or the whole run's datasets, naming the actor (CD17)", async () => {
    const one = datasetService({ deleteRunDatasets: vi.fn().mockResolvedValue({ datasetCount: 1, rowCount: 12 }) });
    const single = await one.registry.call({
      programId: "automation-studio",
      endpoint: AUTOMATION_STUDIO_ENDPOINTS.deleteRunDatasets,
      scope: {},
      actor: writeActor,
      payload: { projectId: "project.one", runId: "run.one", datasetId: "listings", authSessionId: "session.user.writer", authorizationPin: "123456" }
    });
    expect(single).toEqual({ ok: true, payload: { deleted: { datasetCount: 1, rowCount: 12 } } });
    expect(one.authorizeSessionPin).toHaveBeenCalledWith({ sessionId: "session.user.writer", pin: "123456" });
    expect(one.runDatasets.deleteRunDatasets).toHaveBeenCalledWith({ projectId: "project.one", runId: "run.one", datasetId: "listings", actorId: "user.writer" });

    const all = datasetService();
    await all.registry.call({
      programId: "automation-studio",
      endpoint: AUTOMATION_STUDIO_ENDPOINTS.deleteRunDatasets,
      scope: {},
      actor: writeActor,
      payload: { projectId: "project.one", runId: "run.one", authSessionId: "session.user.writer", authorizationPin: "123456" }
    });
    expect(all.runDatasets.deleteRunDatasets).toHaveBeenCalledWith({ projectId: "project.one", runId: "run.one", datasetId: undefined, actorId: "user.writer" });

    const unauthorized = datasetService();
    const refused = await unauthorized.registry.call({
      programId: "automation-studio",
      endpoint: AUTOMATION_STUDIO_ENDPOINTS.deleteRunDatasets,
      scope: {},
      actor: writeActor,
      payload: { projectId: "project.one", runId: "run.one" }
    });
    expect(refused).toMatchObject({ ok: false, error: "PIN is required for this action" });
    expect(unauthorized.runDatasets.deleteRunDatasets).not.toHaveBeenCalled();
  });

  it("forwards the Data window's table-run filters", async () => {
    const { registry, runDatasets } = datasetService({
      listDatasetRuns: vi.fn().mockResolvedValue({ runs: [], nextCursor: null })
    });

    const response = await registry.call({
      programId: "automation-studio",
      endpoint: AUTOMATION_STUDIO_ENDPOINTS.listDatasetRuns,
      scope: {},
      actor: readActor,
      payload: { projectId: "project.one", flowId: "flow.listings", datasetId: "listings", status: "succeeded", cursor: "cursor.page" }
    });

    expect(response).toEqual({ ok: true, payload: { runs: [], page: { nextCursor: null, limit: 50 } } });
    expect(runDatasets.listDatasetRuns).toHaveBeenCalledWith({ projectId: "project.one", flowId: "flow.listings", datasetId: "listings", status: "succeeded", runId: undefined, limit: 50, cursor: "cursor.page" });
  });
});
