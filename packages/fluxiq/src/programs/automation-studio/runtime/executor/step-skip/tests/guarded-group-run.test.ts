// A guarded group inside a loop (t378 W8): each pass confirms a row, closes the
// site's slow-down notice if it shows (`optional: yes`), and waits only on the
// pass where it did (`only after:`). The rule (user): a step whose target is
// absent and that the Flow marks optional is skipped without spending retry or
// recovery budget; every other node keeps its 1 + 3 retries. Before the runtime
// read the guarded shape as optional, every pass without the notice retried it
// and then followed the failed route as a recovery, so a long loop ran out of
// recovery budget and failed.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../../model/index.ts";
import { runAutomationStudioGraph, type AutomationStudioGraphExecutionOptions } from "../../index.ts";

/** The recovery budget a Flow created with Core's defaults runs under (`model/flows.ts`). */
const DEFAULT_RECOVERY_BUDGET = { maxRetriesPerAction: 2, maxRecoveryAttemptsPerSubflow: 2, maxReroutesPerRun: 2 };

const edge = (sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId = "in") => ({ id: `${sourceNodeId}.${sourcePortId}.${targetNodeId}`, sourceNodeId, sourcePortId, targetNodeId, targetPortId });
const press = (id: string, elementId: string): AutomationStudioFlowNode => ({ id, definitionId: "builtin.policy.action", parameterValues: { outputId: "activate-element", parameters: { elementId } } });

/** The shape the script's lines assemble to (`flow-bootstrap/script-statements/guarded-steps.ts`), over `rows` rows. */
function guardedLoop(rows: number): AutomationStudioFlowDocument {
  return {
    schemaVersion: "0.1", flowId: "flow.guarded-loop", ownerKind: "routine", ownerId: "routine.test", name: "Guarded loop", createdAt: 1, updatedAt: 1,
    nodes: [
      { id: "list", definitionId: "builtin.data.constant", parameterValues: { value: Array.from({ length: rows }, (_, index) => index + 1) } },
      { id: "head", definitionId: "builtin.control.merge", parameterValues: { mergeMode: "first" } },
      { id: "each", definitionId: "builtin.control.for-each" },
      press("confirm", "confirm"),
      press("notice", "notice-close"),
      { id: "cooldown", definitionId: "builtin.timing.wait", parameterValues: { duration: 6, unit: "seconds" } },
      { id: "join", definitionId: "builtin.control.merge", parameterValues: { mergeMode: "first" } },
      { id: "end", definitionId: "builtin.control.end" }
    ],
    edges: [
      edge("list", "success", "head"), edge("list", "value", "each", "items"), edge("head", "success", "each"),
      edge("each", "body", "confirm"), edge("confirm", "success", "notice"),
      // The guarded group: past the notice when it is not there, through the wait when it was closed.
      edge("notice", "failed", "join"), edge("notice", "success", "cooldown"), edge("cooldown", "success", "join", "branches"),
      edge("join", "success", "head", "branches"), edge("each", "done", "end")
    ]
  };
}

/** The notice shows on the passes named in `shownOn` (1-based); everywhere else its close button is absent. */
function noticeOn(shownOn: number[]) {
  const calls = { notice: 0, confirm: 0 };
  const dispatch: NonNullable<AutomationStudioGraphExecutionOptions["effectDispatcher"]> = (effect) => {
    const payload = JSON.stringify(effect.payload ?? null);
    if (!payload.includes("notice-close")) {
      calls.confirm += 1;
      return { status: "success", route: "success", outputs: { ok: true } };
    }
    calls.notice += 1;
    return shownOn.includes(calls.notice)
      ? { status: "success", route: "success", outputs: { ok: true } }
      : { status: "failed", route: "failed", message: "No target resolved.", failure: { category: "target_not_found", code: "web.target.not_found", retryable: true, stage: "target_resolution" } };
  };
  return { calls, dispatch };
}

async function run(rows: number, shownOn: number[]) {
  const { calls, dispatch } = noticeOn(shownOn);
  const waits: number[] = [];
  const trace = await runAutomationStudioGraph(guardedLoop(rows), {
    effectDispatcher: dispatch,
    recoveryBudget: DEFAULT_RECOVERY_BUDGET,
    startNodeId: "list",
    delay: async (ms) => { waits.push(ms); }
  });
  return { trace, calls, waits };
}

describe("a guarded group inside a For Each, the notice shown on one pass only", () => {
  it("skips the absent notice on every other pass with one press each, and waits only on the pass it was closed", async () => {
    const { trace, calls, waits } = await run(3, [2]);

    expect(trace.status).toBe("succeeded");
    expect(calls.confirm).toBe(3);
    expect(calls.notice).toBe(3);
    const notices = trace.attempts.filter((attempt) => attempt.nodeId === "notice");
    expect(notices.map((attempt) => [attempt.status, attempt.route])).toEqual([["succeeded", "skipped"], ["succeeded", "success"], ["succeeded", "skipped"]]);
    expect(notices.every((attempt) => attempt.recoveryDecision === undefined && attempt.retry === undefined)).toBe(true);
    expect(notices[0]?.skipped).toMatchObject({ reason: "target_absent" });
    expect(trace.attempts.filter((attempt) => attempt.nodeId === "cooldown")).toHaveLength(1);
    expect(waits).toEqual([6_000]);
    expect(trace.attempts.filter((attempt) => attempt.nodeId === "join")).toHaveLength(3);
  });

  it("finishes a long loop under the default recovery budget, the notice absent on all passes but one", async () => {
    const { trace, calls } = await run(8, [5]);

    expect(trace.status).toBe("succeeded");
    expect(calls.confirm).toBe(8);
    expect(calls.notice).toBe(8);
    expect(trace.attempts.some((attempt) => attempt.recoveryDecision !== undefined)).toBe(false);
    expect(trace.attempts.filter((attempt) => attempt.nodeId === "cooldown")).toHaveLength(1);
  });
});
