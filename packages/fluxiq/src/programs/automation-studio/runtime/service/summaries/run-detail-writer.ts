import type { JsonObject } from "../../../../../core/index.ts";
import { ProgramJsonStore } from "../../../../_shared/storage.ts";
import type { AutomationStudioFlowRunDetail } from "../../../model/index.ts";
import { AutomationStudioProjectRuntimeStreamStore, type AutomationStudioProjectDatabasePool } from "../../../storage/index.ts";
import { upsertBy } from "../collections.ts";
import type { AutomationStudioServiceIndexes } from "../indexes/index.ts";
import type { AutomationStudioFlowPaths, AutomationStudioProjectPaths } from "../paths/index.ts";
import type { AutomationStudioProjectStore } from "../projects/index.ts";
import { adaptiveRuntimeMetricsFromRunDetail, flowRunSummaryWithInterventionSummaries } from "./conversions.ts";
import { AutomationStudioRunDetailLock } from "./run-detail-lock.ts";
import { runDetailPreservingStored } from "./run-detail-merge.ts";
import type { AutomationStudioSummaryStore } from "./store.ts";

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

  // `null` means the typed store is not configured or could not be opened, or
  // refused a run it has never held, and the legacy JSON detail is written
  // instead, as before. A refused run keeps its summary row, when the store
  // accepts that much, so run listings still show it. Once the store is open,
  // reading the stored detail and writing over a run it already holds are
  // strict: a failure propagates, because a JSON copy written in their place
  // would never be read ahead of the typed detail it failed to update.
  private async saveTyped(detail: AutomationStudioFlowRunDetail): Promise<AutomationStudioFlowRunDetail | null> {
    if (!this.runtimeProjectDatabasePool || !this.paths.root) return null;
    const { projectId, flowId, runId } = detail.summary;
    let store: AutomationStudioProjectRuntimeStreamStore;
    try {
      await this.projects.findProject(projectId);
      store = await AutomationStudioProjectRuntimeStreamStore.open({ pool: this.runtimeProjectDatabasePool, projectId });
    } catch {
      return null;
    }
    try {
      const held = await store.getRunDetail(runId);
      // A run first saved to the legacy detail is merged from there when the
      // typed store takes it over, so the move cannot drop what it recorded.
      const stored = held ?? await this.readLegacy(projectId, runId);
      const normalizedDetail = normalizedFlowRunDetail(runDetailPreservingStored(stored, detail));
      try {
        await store.ensureRuntimeFlowProjection({ flowId, name: flowId, now: normalizedDetail.summary.startedAt ?? normalizedDetail.summary.updatedAt });
        await store.putRunDetail(normalizedDetail);
      } catch (error) {
        if (held) throw error;
        await store.upsertRunSummary(normalizedDetail.summary).catch(() => undefined);
        return null;
      }
      return normalizedDetail;
    } finally {
      await store.close();
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
