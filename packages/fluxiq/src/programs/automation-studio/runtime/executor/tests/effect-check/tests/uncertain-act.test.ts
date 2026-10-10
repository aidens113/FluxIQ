// A lasting act whose outcome is uncertain goes through the effect check before
// any retry, route or alternative (state-aware recovery plan C6 step 4, C8):
// `landed` carries the run on without making the act again, `not_landed` makes
// it again under the normal retries, and `unknown` stops the run as Outcome
// uncertain with no handler, failed route or repair after it.
//
// The uncertain act here is the one a lost command produces: the browser was
// interrupted while a committing press was in flight, and the domain reports it
// with the record below (downstream `client/interrupted-action/outcome.ts`).

import type { AutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../../../../../model/index.ts";
import type { AutomationNodeExpectationEvaluation } from "../../../../../nodes/index.ts";
import type { AutomationStudioHostRuntimeBoundary } from "../../../../host-runtime.ts";
import { runAutomationStudioGraph, type AutomationStudioGraphExecutionOptions } from "../../../index.ts";

/** A committing press the browser lost while it was in flight, as the domain reports it. */
const INTERRUPTED_COMMIT: AutomationStudioFailureRecord = { category: "ambiguous_or_unknown", code: "web.action.unknown", retryable: false, stage: "execution", effect: "ambiguous" };
/** The same loss on an act that commits nothing, as the domain reports it. */
const INTERRUPTED_SETTING: AutomationStudioFailureRecord = { category: "action_failed", code: "web.transport.transient", retryable: true, stage: "execution", effect: "unacted" };
/** A press the page turned down outright: a refusal, not an unknown outcome. */
const REFUSED: AutomationStudioFailureRecord = { category: "blocked_by_capability_or_policy", code: "web.action.rejected", retryable: false, stage: "execution", effect: "ambiguous" };

const CART_HOLDS: JsonObject = { conditions: [{ fact: "cart", op: "exists" }], mode: "all" };

/**
 * The page under test. `cart` is what pressing `add` produces; `losses` says
 * which presses of `add` lose their answer (`lost`) and whether the press
 * landed before it was lost. `judges` is false for a host that never answers.
 */
type Page = { cart: boolean; slow: boolean; judges: boolean; presses: string[]; asked: number[] };

function page(overrides: Partial<Pick<Page, "slow" | "judges">> = {}): Page {
  return { cart: false, slow: overrides.slow ?? false, judges: overrides.judges ?? true, presses: [], asked: [] };
}

function press(id: string, parameters: JsonObject = {}): AutomationStudioFlowNode {
  return { id, definitionId: "builtin.policy.action", parameterValues: { outputId: "activate-element", parameters: { elementId: id }, ...parameters } };
}

function edge(sourceNodeId: string, targetNodeId: string, sourcePortId = "success"): AutomationStudioFlowEdge {
  return { id: `${sourceNodeId}.${sourcePortId}.${targetNodeId}`, sourceNodeId, targetNodeId, sourcePortId, targetPortId: "in" };
}

/** start -> add -> next -> done, plus whatever else is given. */
function flow(add: AutomationStudioFlowNode, nodes: AutomationStudioFlowNode[] = [], edges: AutomationStudioFlowEdge[] = []): AutomationStudioFlowDocument {
  const main = [{ id: "start", definitionId: "builtin.control.start" }, add, press("next"), { id: "done", definitionId: "builtin.control.end" }];
  const mainEdges = main.slice(1).map((node, index) => edge(main[index]!.id, node.id));
  return { schemaVersion: "0.1", flowId: "flow.effect-check", ownerKind: "routine", ownerId: "routine.effect-check", name: "Effect check", createdAt: 1, updatedAt: 1, nodes: [...main, ...nodes], edges: [...mainEdges, ...edges] };
}

/** An On Fail handler on `add` whose body presses `dismiss` and resolves. */
const ON_FAIL_HANDLER = {
  nodes: [
    { id: "h.fail", definitionId: "builtin.control.handler", parameterValues: { event: "fail", scope: { kind: "nodes", nodeIds: ["add"] } } },
    press("h.fail.close", { parameters: { elementId: "dismiss" } }),
    { id: "h.fail.end", definitionId: "builtin.control.handler-end", parameterValues: { disposition: "resolve", outputs: { ok: "resolved" } } }
  ] satisfies AutomationStudioFlowNode[],
  edges: [edge("h.fail", "h.fail.close", "body"), edge("h.fail.close", "h.fail.end")]
};

/**
 * Presses what a step names. Each press of `add` takes the failure `lose(n)`
 * gives for its `n`th press, landing first when `landsBeforeLoss`; without a
 * failure it lands and succeeds.
 */
function options(current: Page, lose: (press: number) => AutomationStudioFailureRecord | undefined, landsBeforeLoss = false): AutomationStudioGraphExecutionOptions {
  const host: AutomationStudioHostRuntimeBoundary = {
    capabilities: [],
    expectationEvaluator: (_conditions, _mode, timeoutMs): AutomationNodeExpectationEvaluation => {
      current.asked.push(timeoutMs);
      if (!current.judges) return { passed: false, checkedConditionCount: 0 };
      // A slow page shows the cart only to a check that waits for it.
      const shows = current.cart && (!current.slow || timeoutMs > 0);
      return { passed: shows, checkedConditionCount: 1 };
    }
  };
  return {
    delay: async () => undefined,
    now: () => 1_000,
    currentSubflowId: "main",
    hostRuntime: host,
    effectDispatcher: (effect) => {
      const id = /"elementId":"([^"]+)"/u.exec(JSON.stringify(effect.payload ?? null))?.[1] ?? "?";
      current.presses.push(id);
      if (id !== "add") return { status: "success", route: "success", outputs: { ok: true } };
      const failure = lose(current.presses.filter((pressed) => pressed === "add").length);
      if (!failure) {
        current.cart = true;
        return { status: "success", route: "success", outputs: { ok: true } };
      }
      if (landsBeforeLoss) current.cart = true;
      return { status: "failed", route: "failed", message: "The browser was interrupted while this action was in flight.", failure };
    }
  };
}

const count = (current: Page, id: string) => current.presses.filter((pressed) => pressed === id).length;

describe("an uncertain lasting act goes through the effect check first", () => {
  it("landed: carries the run on as done without dispatching the act again", async () => {
    // The press landed, but the page is slow: the attempt's zero-wait look did not see the cart, the waiting check does.
    const current = page({ slow: true });
    const trace = await runAutomationStudioGraph(flow(press("add", { expectedState: CART_HOLDS })), options(current, (n) => (n === 1 ? INTERRUPTED_COMMIT : undefined), true));

    expect(trace.status).toBe("succeeded");
    expect(count(current, "add")).toBe(1);
    expect(count(current, "next")).toBe(1);
    const add = trace.attempts.find((attempt) => attempt.nodeId === "add")!;
    expect(add).toMatchObject({ status: "failed", effectCheck: { result: "landed" }, stateHeld: { route: "success" } });
    // The attempt's own look waited for nothing and said no; the check waited.
    expect(current.asked[0]).toBe(0);
    expect(current.asked[1]).toBeGreaterThan(0);
  });

  it("not_landed: makes the act again under the normal retries", async () => {
    const current = page();
    const trace = await runAutomationStudioGraph(flow(press("add", { expectedState: CART_HOLDS })), options(current, (n) => (n === 1 ? INTERRUPTED_COMMIT : undefined)));

    expect(trace.status).toBe("succeeded");
    expect(count(current, "add")).toBe(2);
    const adds = trace.attempts.filter((attempt) => attempt.nodeId === "add");
    expect(adds[0]).toMatchObject({ status: "failed", effectCheck: { result: "not_landed" }, recoveryDecision: { selected: { kind: "retry_node" } } });
    expect(adds[0]?.stateHeld).toBeUndefined();
    expect(adds[1]).toMatchObject({ status: "succeeded" });
    expect(adds[1]?.effectCheck).toBeUndefined();
  });

  it("not_landed every time: keeps the four-attempt floor, then fails as any unacted fault does", async () => {
    const current = page();
    const trace = await runAutomationStudioGraph(flow(press("add", { expectedState: CART_HOLDS })), options(current, () => INTERRUPTED_COMMIT));

    expect(count(current, "add")).toBe(4);
    expect(trace.status).toBe("failed");
    expect(trace.message ?? "").not.toMatch(/^Outcome uncertain/u);
    expect(trace.attempts.filter((attempt) => attempt.nodeId === "add").map((attempt) => attempt.effectCheck?.result)).toEqual(["not_landed", "not_landed", "not_landed", "not_landed"]);
  });

  it("unknown: stops as Outcome uncertain with no further dispatch, no handler and no failed route", async () => {
    const current = page({ judges: false });
    const add = press("add", { expectedState: CART_HOLDS });
    const fallback = press("fallback");
    const trace = await runAutomationStudioGraph(
      flow(add, [fallback, ...ON_FAIL_HANDLER.nodes], [edge("add", "fallback", "failed"), ...ON_FAIL_HANDLER.edges]),
      options(current, () => INTERRUPTED_COMMIT)
    );

    expect(trace.status).toBe("failed");
    expect(trace.message).toMatch(/^Outcome uncertain: /u);
    expect(current.presses).toEqual(["add"]);
    expect(trace.handlerExecutions).toBeUndefined();
    expect(trace.attempts.map((attempt) => attempt.nodeId)).toEqual(["start", "add"]);
    expect(trace.attempts[1]).toMatchObject({ status: "failed", effectCheck: { result: "unknown" } });
  });

  it("no expected state: answers unknown without asking the page, and stops", async () => {
    const current = page();
    const trace = await runAutomationStudioGraph(flow(press("add")), options(current, () => INTERRUPTED_COMMIT));

    expect(trace.status).toBe("failed");
    expect(trace.message).toMatch(/^Outcome uncertain: /u);
    expect(current.presses).toEqual(["add"]);
    expect(current.asked).toEqual([]);
    expect(trace.attempts[1]).toMatchObject({ effectCheck: { result: "unknown" } });
  });
});

describe("a lost command reaches the effect check only when the act it lost commits", () => {
  it("a committing act reported interrupted is held back and checked", async () => {
    const current = page();
    const trace = await runAutomationStudioGraph(flow(press("add", { expectedState: CART_HOLDS })), options(current, (n) => (n === 1 ? INTERRUPTED_COMMIT : undefined)));

    const first = trace.attempts.find((attempt) => attempt.nodeId === "add")!;
    expect(first.failure).toEqual(INTERRUPTED_COMMIT);
    expect(first.effectCheck?.result).toBe("not_landed");
  });

  it("an act that commits nothing reported interrupted is simply made again, with no check", async () => {
    const current = page();
    const trace = await runAutomationStudioGraph(flow(press("add", { expectedState: CART_HOLDS })), options(current, (n) => (n === 1 ? INTERRUPTED_SETTING : undefined)));

    expect(trace.status).toBe("succeeded");
    expect(count(current, "add")).toBe(2);
    expect(trace.attempts.some((attempt) => attempt.effectCheck !== undefined)).toBe(false);
  });

  it("a refusal that is not an unknown outcome keeps its handling: the On Fail handler still runs", async () => {
    const current = page();
    const trace = await runAutomationStudioGraph(flow(press("add", { expectedState: CART_HOLDS }), ON_FAIL_HANDLER.nodes, ON_FAIL_HANDLER.edges), options(current, () => REFUSED));

    expect(trace.status).toBe("succeeded");
    expect(count(current, "dismiss")).toBe(1);
    expect(trace.attempts.some((attempt) => attempt.effectCheck !== undefined)).toBe(false);
  });
});
