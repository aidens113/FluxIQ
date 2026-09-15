// The rows runs captured, as datasets: a run's datasets, a page of one
// dataset's rows, an inline export, deletion, and the Data window's project
// table and table-run lists.
//
// Rows are stored raw and are never stripped (CD16), so **every handler here
// asserts the project's domain access before it reads anything**, as the
// reusable-context handlers do (`caches.ts:51`). The run endpoints next door
// skip that check, which is safe only because they expose no row content.
// Reads take `programs.read`; deletion takes `flows.write` and is audited
// (CD17). Paging is clamped through the shared helper, 1-200 with a default of
// 50 (C11), never the Design's 1-500.

import { AUTOMATION_STUDIO_ENDPOINTS, type DatasetRunListRequest, type ProjectDatasetListRequest, type RunDatasetDeleteRequest, type RunDatasetExportRequest, type RunDatasetListRequest, type RunDatasetPageRequest } from "../contracts.ts";
import { automationStudioPageLimit } from "../../storage/index.ts";
import type { AutomationStudioApiDependencies } from "./dependencies.ts";

export function registerRunDatasetEndpoints(dependencies: AutomationStudioApiDependencies): void {
  const { registry, service } = dependencies;

  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listRunDatasets,
    permission: "programs.read",
    handler: async (request) => {
      const payload = datasetPayload<RunDatasetListRequest>(request.payload);
      const projectId = String(payload.projectId ?? "");
      await service.assertProjectDomainAccess(projectId, request.scope.domainId);
      const datasets = await service.runDatasets.listRunDatasets({ projectId, runId: String(payload.runId ?? "") });
      return { ok: true, payload: { datasets } };
    }
  });

  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getRunDatasetPage,
    permission: "programs.read",
    handler: async (request) => {
      const payload = datasetPayload<RunDatasetPageRequest>(request.payload);
      const projectId = String(payload.projectId ?? "");
      await service.assertProjectDomainAccess(projectId, request.scope.domainId);
      const dataset = await service.runDatasets.getRunDatasetPage({
        projectId,
        runId: String(payload.runId ?? ""),
        datasetId: String(payload.datasetId ?? ""),
        limit: automationStudioPageLimit(payload.limit),
        cursor: payload.cursor ?? null
      });
      return { ok: true, payload: { dataset } };
    }
  });

  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.exportRunDataset,
    permission: "programs.read",
    handler: async (request) => {
      const payload = datasetPayload<RunDatasetExportRequest>(request.payload);
      const projectId = String(payload.projectId ?? "");
      await service.assertProjectDomainAccess(projectId, request.scope.domainId);
      const exported = await service.runDatasets.exportRunDataset({
        projectId,
        runId: String(payload.runId ?? ""),
        datasetId: String(payload.datasetId ?? ""),
        format: payload.format as RunDatasetExportRequest["format"],
        actorId: request.actor?.userId
      });
      return { ok: true, payload: { export: exported } };
    }
  });

  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.deleteRunDatasets,
    permission: "flows.write",
    handler: async (request) => {
      const payload = datasetPayload<RunDatasetDeleteRequest>(request.payload);
      const projectId = String(payload.projectId ?? "");
      await service.assertProjectDomainAccess(projectId, request.scope.domainId);
      const deleted = await service.runDatasets.deleteRunDatasets({
        projectId,
        runId: String(payload.runId ?? ""),
        datasetId: typeof payload.datasetId === "string" ? payload.datasetId : undefined,
        actorId: request.actor!.userId
      });
      return { ok: true, payload: { deleted } };
    }
  });

  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listProjectDatasets,
    permission: "programs.read",
    handler: async (request) => {
      const payload = datasetPayload<ProjectDatasetListRequest>(request.payload);
      const projectId = String(payload.projectId ?? "");
      await service.assertProjectDomainAccess(projectId, request.scope.domainId);
      const limit = automationStudioPageLimit(payload.limit);
      const page = await service.runDatasets.listProjectDatasets({
        projectId,
        flowId: typeof payload.flowId === "string" ? payload.flowId : undefined,
        search: typeof payload.search === "string" ? payload.search : undefined,
        limit,
        cursor: payload.cursor ?? null
      });
      return { ok: true, payload: { datasets: page.datasets, page: { nextCursor: page.nextCursor, limit } } };
    }
  });

  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listDatasetRuns,
    permission: "programs.read",
    handler: async (request) => {
      const payload = datasetPayload<DatasetRunListRequest>(request.payload);
      const projectId = String(payload.projectId ?? "");
      await service.assertProjectDomainAccess(projectId, request.scope.domainId);
      const limit = automationStudioPageLimit(payload.limit);
      const page = await service.runDatasets.listDatasetRuns({
        projectId,
        flowId: String(payload.flowId ?? ""),
        datasetId: String(payload.datasetId ?? ""),
        status: typeof payload.status === "string" ? payload.status : undefined,
        runId: typeof payload.runId === "string" ? payload.runId : undefined,
        limit,
        cursor: payload.cursor ?? null
      });
      return { ok: true, payload: { runs: page.runs, page: { nextCursor: page.nextCursor, limit } } };
    }
  });
}

function datasetPayload<TRequest>(payload: unknown): Partial<TRequest> {
  return payload && typeof payload === "object" ? payload as Partial<TRequest> : {};
}
