import type { JsonObject } from "../../../../../core/index.ts";
import { ProgramJsonStore } from "../../../../persistence/program-state/storage.ts";
import type { AutomationStudioFlowRunDetail } from "../../../../../flows/authoring/model/index.ts";
import { AutomationStudioProjectRuntimeStreamStore, AutomationStudioProjectStoreUnavailableError, type AutomationStudioProjectDatabasePool } from "../../../../persistence/automation/index.ts";
import { upsertBy } from "../../collections.ts";
import type { AutomationStudioServiceIndexes } from "../../indexes/index.ts";
import type { AutomationStudioFlowPaths, AutomationStudioProjectPaths } from "../../paths/index.ts";
import type { AutomationStudioProjectStore } from "../../projects/index.ts";
import { adaptiveRuntimeMetricsFromRunDetail } from "../adaptive-metrics.ts";
import { flowRunSummaryWithInterventionSummaries } from "../conversions.ts";
import { AutomationStudioRunDetailLock } from "./detail-lock.ts";
import { runDetailPreservingStored } from "./detail-merge.ts";
import type { AutomationStudioSummaryStore } from "../store.ts";

// Saving a run's detail: into the typed runtime store when the service has one,
// otherwise into the legacy JSON detail, its JSONL collections, the JSON run
// index and the legacy SQL summary row. Every save is serialized per run and
// merged onto the detail already stored (see run-detail-merge.ts), so a detail
// rebuilt from the bare session -- by the summary index rebuild, the
// partial-write recovery or a session write -- can never replace what the
// recovery annotation recorded.
export class AutomationStudioRunDetailWriter {
  private readonly lock = new AutomationStudioRunDetailLock();

  constructor(
    private readonly paths: AutomationStudioProjectPaths,
    private readonly flowPaths: AutomationStudioFlowPaths,
    private readonly projects: AutomationStudioProjectStore,
    private readonly indexes: AutomationStudioServiceIndexes,
    // The summary store keeps the legacy writers and the typed-store access the
    // rest of the service also uses; the writer calls back into them.
    private readonly summaries: Pick<AutomationStudioSummaryStore, "writeJsonLines" | "writeFlowRunSummary" | "tryWithRuntimeStreamStore">,
    private readonly runtimeProjectDatabasePool?: AutomationStudioProjectDatabasePool
  ) {}

  async save(detail: AutomationStudioFlowRunDetail): Promise<AutomationStudioFlowRunDetail> {
    const { projectId, runId } = detail.summary;
    await this.projects.ensureProjectStructure(projectId);
    return await this.lock.withRun(projectId, runId, async () => await this.saveLocked(detail));
  }

  // Whether any readable detail is stored for the run, in either store, so a
  // rebuild never writes over one.
  async hasStored(projectId: string, runId: string): Promise<boolean> {
    const typed = await this.summaries.tryWithRuntimeStreamStore(projectId, async (store) => await store.getRunDetail(runId, { includeCollections: false }));
    return Boolean(typed) || await this.readLegacy(projectId, runId) !== null;
  }

  private async saveLocked(detail: AutomationStudioFlowRunDetail): Promise<AutomationStudioFlowRunDetail> {
    const { projectId, runId } = detail.summary;
    const typed = await this.saveTyped(detail);
    if (typed) return typed;
    let normalizedDetail = normalizedFlowRunDetail(detail);
    await new ProgramJsonStore<JsonObject>(this.flowPaths.flowRunDetailFile(projectId, runId), () => ({})).update((stored) => {
      normalizedDetail = normalizedFlowRunDetail(runDetailPreservingStored(storedFlowRunDetail(stored), detail));
      return normalizedDetail as unknown as JsonObject;
    });
    await Promise.all([
      this.summaries.writeJsonLines(this.flowPaths.flowRunActionsFile(projectId, runId), normalizedDetail.actionAttempts ?? []),
      this.summaries.writeJsonLines(this.flowPaths.flowRunRouteDecisionsFile(projectId, runId), normalizedDetail.routeDecisions),
      this.summaries.writeJsonLines(this.flowPaths.flowRunSubflowsFile(projectId, runId), normalizedDetail.subflows),
      this.summaries.writeJsonLines(this.flowPaths.flowRunInterventionsFile(projectId, runId), normalizedDetail.interventions)
    ]);
    await this.indexes.writeFlowRunIndex(projectId, (index) => ({ schemaVersion: "0.1", runs: upsertBy(index.runs ?? [], "runId", normalizedDetail.summary) }));
    if (this.paths.root) await this.summaries.writeFlowRunSummary(projectId, normalizedDetail.summary);
    return normalizedDetail;
  }

  // `null` means typed storage is absent, or unavailable (closing or closed).
  // Once configured, every other open, read or write failure propagates with its
  // original cause, including the first write. A legacy file cannot stand in for
  // the SQL run row that datasets need, except when the store itself is gone.
  private async saveTyped(detail: AutomationStudioFlowRunDetail): Promise<AutomationStudioFlowRunDetail | null> {
    if (!this.runtimeProjectDatabasePool || !this.paths.root) return null;
    const { projectId, flowId, runId } = detail.summary;
    await this.projects.requireProject(projectId);
    let store: AutomationStudioProjectRuntimeStreamStore;
    try {
      store = await AutomationStudioProjectRuntimeStreamStore.open({ pool: this.runtimeProjectDatabasePool, projectId });
    } catch (error) {
      // The store is gone (pool closing or closed, t258): no run row and no dataset
      // row can be written for this run, so the legacy detail written instead is
      // merged back by the next typed save, and the run ends failed, never throws.
      if (AutomationStudioProjectStoreUnavailableError.is(error)) return null;
      throw error;
    }
    let failed = true;
    try {
      // The stream read here is handed to the write below, so a save reads the
      // run's events once rather than twice.
      const { detail: held, events } = await store.readRunForUpdate(runId);
      // A run first saved to the legacy detail is merged from there when the
      // typed store takes it over, so the move cannot drop what it recorded.
      const stored = held ?? await this.readLegacy(projectId, runId);
      const normalizedDetail = normalizedFlowRunDetail(runDetailPreservingStored(stored, detail));
      await store.ensureRuntimeFlowProjection({ flowId, name: flowId, now: normalizedDetail.summary.startedAt ?? normalizedDetail.summary.updatedAt });
      await store.putRunDetail(normalizedDetail, events ? { existingEvents: events } : {});
      failed = false;
      return normalizedDetail;
    } finally {
      // Cleanup must not replace the original storage error with a secondary close failure.
      if (failed) await store.close().catch(() => undefined);
      else await store.close();
    }
  }

  // A legacy detail file that is present but unreadable throws rather than
  // reading as absent.
  private async readLegacy(projectId: string, runId: string): Promise<AutomationStudioFlowRunDetail | null> {
    return storedFlowRunDetail(await new ProgramJsonStore<JsonObject>(this.flowPaths.flowRunDetailFile(projectId, runId), () => ({})).read());
  }
}

function normalizedFlowRunDetail(detail: AutomationStudioFlowRunDetail): AutomationStudioFlowRunDetail {
  const detailWithMetrics: AutomationStudioFlowRunDetail = {
    ...detail,
    metadata: {
      ...(detail.metadata ?? {}),
      adaptiveMetrics: adaptiveRuntimeMetricsFromRunDetail(detail)
    }
  };
  return { ...detailWithMetrics, summary: flowRunSummaryWithInterventionSummaries(detailWithMetrics) };
}

function storedFlowRunDetail(stored: JsonObject): AutomationStudioFlowRunDetail | null {
  return typeof (stored.summary as { runId?: unknown } | undefined)?.runId === "string" ? stored as unknown as AutomationStudioFlowRunDetail : null;
}
