import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowDocument } from "../../../../model/index.ts";
import type { AutomationStudioGraphExecutionTrace, AutomationStudioNodeAttemptTrace } from "../../contracts.ts";
import { runAutomationStudioGraph } from "../../graph-run.ts";
import { automationStudioAttemptInputs, automationStudioTraceWithSharedInputs } from "../index.ts";

// Obviously synthetic: a run input that appears inside every page the run reads.
const QUERY = "synthetic-query-text-that-must-never-be-persisted";

/** A page snapshot as a web step returns one: a few hundred elements of text, about 40 KB. */
function pageSnapshot(step: number): JsonValue {
  return { url: `https://example.test/step-${step}`, interactiveElements: Array.from({ length: 400 }, (_, index) => ({ id: `e${index}`, role: "button", text: `Element ${index} of step ${step} near ${QUERY}` })) };
}

function chainFlow(steps: number): AutomationStudioFlowDocument {
  const nodes = Array.from({ length: steps }, (_, index) => ({ id: `s${index + 1}`, definitionId: "builtin.policy.action", parameterValues: { outputId: "read-page", parameters: {} } }));
  return {
    schemaVersion: "0.1",
    flowId: "flow.shared-inputs",
    ownerKind: "task",
    ownerId: "task.shared-inputs",
    name: "Shared inputs",
    createdAt: 1,
    updatedAt: 1,
    nodes,
    edges: nodes.slice(1).map((node, index) => ({ id: `s${index + 1}.${node.id}`, sourceNodeId: `s${index + 1}`, sourcePortId: "success", targetNodeId: node.id }))
  };
}

async function runChain(steps: number): Promise<{ executed: AutomationStudioGraphExecutionTrace; saved: AutomationStudioGraphExecutionTrace }> {
  let executed: AutomationStudioGraphExecutionTrace | undefined;
  let step = 0;
  const saved = await runAutomationStudioGraph(chainFlow(steps), {
    inputs: { query: QUERY },
    effectDispatcher: () => ({ status: "success", route: "success", outputs: { ok: true, page: pageSnapshot(++step) } })
  }, (run) => { executed = run; });
  return { executed: executed!, saved };
}

const size = (value: unknown) => JSON.stringify(value).length;

function attempt(attemptId: string, inputs: Record<string, JsonValue>, outputs: Record<string, JsonValue> = {}): AutomationStudioNodeAttemptTrace {
  return { attemptId, nodeId: attemptId.split(".attempt.")[0]!, definitionId: "builtin.policy.action", startedAt: 1, status: "succeeded", route: "success", inputs, outputs, effects: [] };
}

function trace(attempts: AutomationStudioNodeAttemptTrace[]): AutomationStudioGraphExecutionTrace {
  return { status: "succeeded", startedAt: 1, finishedAt: 2, attempts, values: {}, effects: [] };
}

describe("a saved trace keeps each value once", () => {
  it("grows with its steps, not their square, and reads back every attempt's inputs as the run executed with them", async () => {
    const { executed, saved } = await runChain(20);
    const page = size(pageSnapshot(1));

    expect(saved.status).toBe("succeeded");
    expect(saved.attempts).toHaveLength(20);
    // Executed: attempt n saw the n-1 pages before it, twice each (by node and bare key).
    expect(size(executed.attempts.map((each) => each.inputs))).toBeGreaterThan(150 * page);
    // Saved: each page once in its own attempt's outputs and once more in the run's values.
    expect(size(saved.attempts.map((each) => each.inputs))).toBeLessThan(page);
    expect(size(saved)).toBeLessThan(3 * 20 * page);
    for (const [index, each] of executed.attempts.entries()) {
      // The saved trace withholds the query wherever it was; the executed one kept it.
      expect(automationStudioAttemptInputs(saved.attempts, index)).toEqual(withheld(each.inputs));
    }
    expect(JSON.stringify(saved)).not.toContain(QUERY);
  });

  it("survives being written and read back", async () => {
    const { saved } = await runChain(6);
    const stored = JSON.parse(JSON.stringify(saved)) as AutomationStudioGraphExecutionTrace;

    for (const index of saved.attempts.keys()) {
      expect(automationStudioAttemptInputs(stored.attempts, index)).toEqual(automationStudioAttemptInputs(saved.attempts, index));
    }
    expect(automationStudioAttemptInputs(stored.attempts, 5)["s5.page"]).toEqual(stored.attempts[4]!.outputs.page);
  });

  it("names only a value that is the very object an earlier attempt's outputs hold, and copies an equal one", () => {
    const page = { text: "page" };
    const lookalike = { text: "page" };
    const shared = automationStudioTraceWithSharedInputs(trace([
      attempt("a.attempt.1", {}, { page }),
      attempt("b.attempt.2", { "a.page": page, page, other: lookalike, short: "kept", flag: true })
    ]), {});
    const second = shared.attempts[1]!;

    expect(second.inputs).toEqual({ other: lookalike, short: "kept", flag: true });
    expect(second.inputs.other).toBe(lookalike);
    expect(second.inputsSince).toEqual({ attemptId: "a.attempt.1", shared: [{ input: "a.page", attemptId: "a.attempt.1", output: "page" }, { input: "page", attemptId: "a.attempt.1", output: "page" }] });
    expect(automationStudioAttemptInputs(shared.attempts, 1)).toEqual({ "a.page": page, page, other: lookalike, short: "kept", flag: true });
  });

  it("keeps only what changed since the attempt before, and names what that attempt saw and this one did not", () => {
    const items = [{ name: "row" }];
    const first = attempt("read.attempt.1", { query: "q" }, { items });
    const second = attempt("each.attempt.2", { query: "q", "read.items": items, items });
    const third = attempt("act.attempt.3", { query: "q", "read.items": items });
    const shared = automationStudioTraceWithSharedInputs(trace([first, second, third]), {});

    expect(shared.attempts[0]).toBe(first);
    expect(shared.attempts[2]!.inputs).toEqual({});
    expect(shared.attempts[2]!.inputsSince).toEqual({ attemptId: "each.attempt.2", removed: ["items"] });
    expect(automationStudioAttemptInputs(shared.attempts, 2)).toEqual({ query: "q", "read.items": items });
  });

  it("leaves a run input at its own key where it is, so the saved trace withholds it there by position", () => {
    const supplied = { secret: "synthetic" };
    const shared = automationStudioTraceWithSharedInputs(trace([
      attempt("a.attempt.1", {}, { object: supplied }),
      attempt("b.attempt.2", { object: supplied })
    ]), { object: supplied });

    expect(shared.attempts[1]!.inputs.object).toBe(supplied);
    expect(shared.attempts[1]!.inputsSince?.shared).toBeUndefined();
  });

  it("names a repeated attempt id only where a reader walking back finds that very attempt", () => {
    const page = { text: "first" };
    const shared = automationStudioTraceWithSharedInputs(trace([
      attempt("a.attempt.1", {}, { page }),
      attempt("a.attempt.1", {}, { page: { text: "second" } }),
      attempt("b.attempt.3", { page })
    ]), {});

    expect(shared.attempts[2]!.inputs.page).toBe(page);
    expect(automationStudioAttemptInputs(shared.attempts, 2).page).toBe(page);
  });

  it("keeps an attempt saved before as it was and goes on from what it saw", () => {
    const page = { text: "page" };
    const once = automationStudioTraceWithSharedInputs(trace([attempt("a.attempt.1", {}, { page }), attempt("b.attempt.2", { page })]), {});
    const resumed = automationStudioTraceWithSharedInputs(trace([...once.attempts, attempt("c.attempt.3", { page, more: 1 })]), {});

    expect(resumed.attempts[1]).toBe(once.attempts[1]);
    expect(resumed.attempts[2]!.inputs).toEqual({ more: 1 });
    expect(automationStudioAttemptInputs(resumed.attempts, 2)).toEqual({ page, more: 1 });
  });

  it("hands back a trace with nothing to share as it came", () => {
    const single = trace([attempt("a.attempt.1", { query: "q" })]);
    expect(automationStudioTraceWithSharedInputs(single, {})).toBe(single);
  });
});

/** What the saved trace makes of the run's query: the whole value at its own key, the text inside a page. */
function withheld(inputs: Record<string, JsonValue>): Record<string, JsonValue> {
  return JSON.parse(JSON.stringify(inputs).replaceAll(`"query":"${QUERY}"`, "\"query\":\"[withheld]\"").replaceAll(QUERY, "[withheld]")) as Record<string, JsonValue>;
}
