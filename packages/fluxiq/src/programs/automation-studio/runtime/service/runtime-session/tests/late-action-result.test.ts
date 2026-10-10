import { describe, expect, it, vi } from "vitest";
import type { ClientGatewayLateActionResult } from "../../../../../../client-gateway/index.ts";
import type { AutomationStudioFlowRunDetail } from "../../../../model/index.ts";
import { AUTOMATION_STUDIO_LATE_ACTION_RESULTS_LIMIT, AutomationStudioLateActionResults, type AutomationStudioLateActionResultPorts } from "../late-action-result.ts";

const owner = { projectId: "project.late", runId: "run.late" };

function late(fields: Partial<ClientGatewayLateActionResult> = {}): ClientGatewayLateActionResult {
  return {
    commandId: "command.1",
    actionType: "example.press",
    owner,
    durable: false,
    closedAs: "timed_out",
    dispatchedAt: 1,
    closedAt: 2,
    receivedAt: 3,
    status: "unknown",
    reportedStatus: "interrupted",
    interrupted: true,
    effect: "ambiguous",
    failureCode: "web.action.unknown",
    sameSession: false,
    ...fields
  };
}

function detail(metadata: AutomationStudioFlowRunDetail["metadata"] = {}): AutomationStudioFlowRunDetail {
  return {
    schemaVersion: "0.1",
    summary: { schemaVersion: "0.1", runId: owner.runId, flowId: "flow.late", projectId: owner.projectId, status: "failed", startedAt: 1, updatedAt: 4, routeDecisionCount: 0, subflowEntryCount: 0, actionAttemptCount: 1, interventionCount: 0, adaptationCount: 0 },
    routeDecisions: [],
    subflows: [],
    interventions: [],
    adaptationIds: [],
    changeProposalIds: [],
    metadata
  };
}

function harness(stored: AutomationStudioFlowRunDetail | null) {
  let current = stored;
  const order: string[] = [];
  const locked = vi.fn();
  const ports = {
    withRun: locked,
    readDetail: vi.fn(async () => {
      order.push("read");
      return current;
    }),
    saveFlowRunDetail: vi.fn(async (saved: AutomationStudioFlowRunDetail) => {
      order.push("save");
      current = saved;
    })
  };
  const typed: AutomationStudioLateActionResultPorts = {
    withRun: async <T>(_projectId: string, _runId: string, operation: () => Promise<T>): Promise<T> => {
      locked();
      order.push("lock");
      try {
        return await operation();
      } finally {
        order.push("unlock");
      }
    },
    readDetail: ports.readDetail,
    saveFlowRunDetail: ports.saveFlowRunDetail
  };
  return { ports, order, current: () => current, results: new AutomationStudioLateActionResults(typed) };
}

describe("a late action result on its run's evidence", () => {
  it("is added to the run detail's late results under the run's session lock, with closed fields only", async () => {
    const { results, order, current } = harness(detail({ message: "kept" }));
    expect(await results.record(late())).toBe(true);
    expect(order).toEqual(["lock", "read", "save", "unlock"]);
    expect(current()?.metadata).toEqual({
      message: "kept",
      lateActionResults: [{
        commandId: "command.1", actionType: "example.press", durable: false, closedAs: "timed_out", status: "unknown",
        reportedStatus: "interrupted", interrupted: true, effect: "ambiguous", failureCode: "web.action.unknown",
        sameSession: false, dispatchedAt: 1, closedAt: 2, receivedAt: 3
      }]
    });
  });

  it("records the same answer once, and keeps only the newest past its bound", async () => {
    const { results, current, ports } = harness(detail());
    await results.record(late());
    await results.record(late());
    expect(ports.saveFlowRunDetail).toHaveBeenCalledTimes(1);
    for (let index = 0; index < AUTOMATION_STUDIO_LATE_ACTION_RESULTS_LIMIT + 2; index += 1) await results.record(late({ commandId: `command.extra.${index}` }));
    const kept = current()?.metadata?.lateActionResults as Array<{ commandId: string }>;
    expect(kept).toHaveLength(AUTOMATION_STUDIO_LATE_ACTION_RESULTS_LIMIT);
    expect(kept.at(-1)?.commandId).toBe(`command.extra.${AUTOMATION_STUDIO_LATE_ACTION_RESULTS_LIMIT + 1}`);
  });

  it("is not recorded when its command named no run, or its run has no stored detail", async () => {
    const { results, ports } = harness(null);
    const { owner: _unused, ...unowned } = late();
    expect(await results.record(unowned)).toBe(false);
    expect(ports.withRun).not.toHaveBeenCalled();
    expect(await results.record(late())).toBe(false);
    expect(ports.saveFlowRunDetail).not.toHaveBeenCalled();
  });
});
