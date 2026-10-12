import type { ClientGatewayLateActionResult } from "../../../../../client-gateway/index.ts";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowRunDetail } from "../../../model/index.ts";

// An action result that came after Core stopped waiting for its command, put on
// the run's evidence (browser contract B3, C8).
//
// The gateway already kept it from being applied: it resolved nobody's wait
// and the run went on from the outcome it was given (`client-gateway/service/
// command-history.ts`). What is left is to say it happened, where a reader of
// the run looks: the run detail's `metadata.lateActionResults`. The run detail
// keeps a metadata key no later save carries (`../summaries/run-detail-merge.ts`),
// so a list written here survives the run's own saves.
//
// The record is the gateway's closed fields only -- the command, how Core had
// ended it, what the client said it became, whether it was interrupted -- never
// the client's message, payload or target.

/** Where a run detail keeps the late results of its commands. */
export const AUTOMATION_STUDIO_LATE_ACTION_RESULTS_METADATA_KEY = "lateActionResults";

/** How many late results one run keeps; the oldest go first. */
export const AUTOMATION_STUDIO_LATE_ACTION_RESULTS_LIMIT = 20;

export type AutomationStudioLateActionResultPorts = {
  /** The run's session lock, so no session write of the run lands between the read and the save. */
  withRun<T>(projectId: string, runId: string, operation: () => Promise<T>): Promise<T>;
  /** The stored detail. It must not read the run's session through that lock, which is already held. */
  readDetail(projectId: string, runId: string): Promise<AutomationStudioFlowRunDetail | null>;
  saveFlowRunDetail(detail: AutomationStudioFlowRunDetail): Promise<unknown>;
};

/** Records late action results on their runs' details. */
export class AutomationStudioLateActionResults {
  constructor(private readonly ports: AutomationStudioLateActionResultPorts) {}

  /**
   * Puts a late result on its run's detail, and says whether it is there. A
   * result whose command named no run, or whose run has no stored detail, is
   * not recorded. The same answer sent again is recorded once.
   */
  async record(late: ClientGatewayLateActionResult): Promise<boolean> {
    if (!late.owner) return false;
    const { projectId, runId } = late.owner;
    return await this.ports.withRun(projectId, runId, async () => {
      const detail = await this.ports.readDetail(projectId, runId);
      if (!detail || detail.summary.runId !== runId || detail.summary.projectId !== projectId) return false;
      const stored = storedRecords(detail.metadata?.[AUTOMATION_STUDIO_LATE_ACTION_RESULTS_METADATA_KEY]);
      const record = lateRecord(late);
      if (stored.some((kept) => kept.commandId === record.commandId && kept.reportedStatus === record.reportedStatus && kept.status === record.status)) return true;
      const records = [...stored, record].slice(-AUTOMATION_STUDIO_LATE_ACTION_RESULTS_LIMIT);
      await this.ports.saveFlowRunDetail({ ...detail, metadata: { ...(detail.metadata ?? {}), [AUTOMATION_STUDIO_LATE_ACTION_RESULTS_METADATA_KEY]: records } });
      return true;
    });
  }
}

function lateRecord(late: ClientGatewayLateActionResult): JsonObject {
  return {
    commandId: late.commandId,
    actionType: late.actionType,
    durable: late.durable,
    closedAs: late.closedAs,
    status: late.status,
    reportedStatus: late.reportedStatus,
    interrupted: late.interrupted,
    ...(late.effect ? { effect: late.effect } : {}),
    ...(late.failureCode ? { failureCode: late.failureCode } : {}),
    sameSession: late.sameSession,
    dispatchedAt: late.dispatchedAt,
    ...(late.closedAt !== undefined ? { closedAt: late.closedAt } : {}),
    receivedAt: late.receivedAt
  };
}

function storedRecords(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.filter((item): item is JsonObject => typeof item === "object" && item !== null && !Array.isArray(item)) : [];
}
