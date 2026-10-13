// One page capture between two web steps, not two (t480). The page an attempt
// ended on is offered to the next attempt's `before_action` capture when nothing
// started between them and it arrived moments ago; a host that answers it reads
// N + 1 pages for N steps in a row instead of 2N, and every attempt still
// carries both sides.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../../../model/index.ts";
import type { AutomationStudioHostStateSnapshotRef } from "../../../../host-runtime.ts";
import { runAutomationStudioGraph, type AutomationStudioGraphExecutionOptions } from "../../../index.ts";

/** What one page read costs, as measured in the Lab (run `run-mv5yaapy-8c34bf34`): about 0.45 s. */
const READ_MS = 450;
/** What one step's own act costs on the simulated clock. */
const ACT_MS = 1_000;

const edge = (sourceNodeId: string, targetNodeId: string) => ({ id: `${sourceNodeId}.${targetNodeId}`, sourceNodeId, sourcePortId: "success", targetNodeId, targetPortId: "in" });
const webStep = (id: string): AutomationStudioFlowNode => ({ id, definitionId: "builtin.policy.action", parameterValues: { outputId: `output.${id}` } });

/** The nodes in a row, each on the last one's success. */
function chain(nodes: AutomationStudioFlowNode[]): AutomationStudioFlowDocument {
  return {
    schemaVersion: "0.1", flowId: "flow.host-state", ownerKind: "routine", ownerId: "routine.test", name: "Host state", createdAt: 1, updatedAt: 1,
    nodes,
    edges: nodes.slice(1).map((node, index) => edge(nodes[index]!.id, node.id))
  };
}

/**
 * A host shaped like the web domain's: it declines a node that never touches the
 * page, answers an offered page when `honours` is set, and otherwise reads the
 * page, which costs `READ_MS` on the run's clock.
 */
function pageHost(clock: { t: number }, honours: boolean) {
  const reads: string[] = [];
  const offered: string[] = [];
  const hostRuntime: NonNullable<AutomationStudioGraphExecutionOptions["hostRuntime"]> = {
    capabilities: ["state-snapshot", "state-diff"],
    captureStateSnapshot: ({ node, attemptId, point, previousStateRef }) => {
      if (previousStateRef) offered.push(`${attemptId}:${previousStateRef.stateRef}`);
      if (node.definitionId !== "builtin.policy.action") throw new Error("Not a page step.");
      if (honours && point === "before_action" && previousStateRef) return previousStateRef;
      clock.t += READ_MS;
      reads.push(`${attemptId}:${point}`);
      const id = `page.${reads.length}`;
      return { stateSnapshotId: id, stateRef: `${id}@${attemptId}:${point}`, capturedAt: clock.t, summary: { page: id } };
    },
    inspectStateDiff: ({ before, after }) => ({ before: before?.stateRef ?? null, after: after?.stateRef ?? null })
  };
  return { reads, offered, hostRuntime };
}

function simulated(failOnce?: string) {
  const clock = { t: 10_000, waits: [] as number[] };
  const failed = new Set<string>();
  const options: Partial<AutomationStudioGraphExecutionOptions> = {
    now: () => clock.t,
    delay: async (ms) => {
      clock.waits.push(ms);
      clock.t += ms;
    },
    effectDispatcher: (effect) => {
      clock.t += ACT_MS;
      const outputId = String((effect.payload as { outputId?: unknown } | undefined)?.outputId);
      if (outputId === failOnce && !failed.has(outputId)) {
        failed.add(outputId);
        return { status: "failed", route: "failed", outputs: {}, failure: { category: "action_failed", code: "test.slow_down", retryable: true, stage: "execution", effect: "unacted", retryAfterMs: 2_000 } };
      }
      return { status: "success", route: "success", outputs: { ok: true } };
    }
  };
  return { clock, options };
}

const refsOf = (refs: { beforeAction?: AutomationStudioHostStateSnapshotRef; afterAction?: AutomationStudioHostStateSnapshotRef } | undefined) => [refs?.beforeAction?.stateRef, refs?.afterAction?.stateRef];

describe("one page capture between two web steps", () => {
  // The Lab trial's shape: 13 web steps in a row.
  const steps = Array.from({ length: 13 }, (_, index) => webStep(`step${index + 1}`));

  it("reads N + 1 pages for N web steps in a row, where it read 2N, and spends that much less time capturing", async () => {
    const before = simulated();
    const twice = pageHost(before.clock, false);
    const beforeStart = before.clock.t;
    const beforeTrace = await runAutomationStudioGraph(chain(steps), { ...before.options, hostRuntime: twice.hostRuntime });

    const after = simulated();
    const once = pageHost(after.clock, true);
    const afterStart = after.clock.t;
    const afterTrace = await runAutomationStudioGraph(chain(steps), { ...after.options, hostRuntime: once.hostRuntime });

    expect(beforeTrace.status).toBe("succeeded");
    expect(afterTrace.status).toBe("succeeded");
    // The cost test: 13 steps make 26 reads before, at most 14 after.
    expect(twice.reads).toHaveLength(26);
    expect(once.reads).toHaveLength(14);
    expect(once.reads[0]).toBe("step1.attempt.1:before_action");
    expect(once.reads.slice(1).every((read) => read.endsWith(":after_action"))).toBe(true);
    // Simulated time, the acts unchanged: 13 x 1 s of acts plus 26 or 14 reads at 0.45 s.
    expect(beforeTrace.attempts).toHaveLength(13);
    expect(before.clock.t - beforeStart).toBe(13 * ACT_MS + 26 * READ_MS);
    expect(after.clock.t - afterStart).toBe(13 * ACT_MS + 14 * READ_MS);
  });

  it("still gives every attempt both sides and a diff, the next step starting on the page the last one ended on", async () => {
    const { clock, options } = simulated();
    const host = pageHost(clock, true);
    const trace = await runAutomationStudioGraph(chain(steps.slice(0, 3)), { ...options, hostRuntime: host.hostRuntime });

    expect(trace.attempts.map((attempt) => refsOf(attempt.stateRefs))).toEqual([
      ["page.1@step1.attempt.1:before_action", "page.2@step1.attempt.1:after_action"],
      ["page.2@step1.attempt.1:after_action", "page.3@step2.attempt.2:after_action"],
      ["page.3@step2.attempt.2:after_action", "page.4@step3.attempt.3:after_action"]
    ]);
    expect(trace.attempts.map((attempt) => attempt.stateRefs?.stateDiff)).toEqual(trace.attempts.map((attempt) => ({ before: attempt.stateRefs?.beforeAction?.stateRef, after: attempt.stateRefs?.afterAction?.stateRef })));
    // `from`, the summary and the capture time are the snapshot's own: it is the same object.
    expect(trace.attempts[1]?.stateRefs?.beforeAction).toEqual(trace.attempts[0]?.stateRefs?.afterAction);
  });

  it("reads the page again after a node between that the host does not capture", async () => {
    const { clock, options } = simulated();
    const host = pageHost(clock, true);
    const between: AutomationStudioFlowNode = { id: "value", definitionId: "builtin.data.constant", parameterValues: { value: 1 } };
    await runAutomationStudioGraph(chain([webStep("first"), between, webStep("second")]), { ...options, hostRuntime: host.hostRuntime });

    // The constant's start spent the offer, so the second step was offered nothing.
    expect(host.offered).toEqual(["value.attempt.2:page.2@first.attempt.1:after_action"]);
    expect(host.reads).toEqual(["first.attempt.1:before_action", "first.attempt.1:after_action", "second.attempt.3:before_action", "second.attempt.3:after_action"]);
  });

  it("reads the page again when time passed before the next attempt: a retry after its backoff", async () => {
    const { clock, options } = simulated("output.second");
    const host = pageHost(clock, true);
    const trace = await runAutomationStudioGraph(chain([webStep("first"), webStep("second")]), { ...options, hostRuntime: host.hostRuntime });

    expect(trace.status).toBe("succeeded");
    expect(clock.waits.some((ms) => ms > 250)).toBe(true);
    // The first try started on the page the first step ended on; the retry, two seconds on, read it again.
    expect(host.reads).toEqual([
      "first.attempt.1:before_action",
      "first.attempt.1:after_action",
      "second.attempt.2:after_action",
      "second.attempt.3:before_action",
      "second.attempt.3:after_action"
    ]);
  });
});
