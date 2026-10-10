// A step's own `done when:` (t413) is its node's expected state as page facts,
// `{ facts: [...] }`, and an act whose answer was lost is settled from them
// through the batched fact check (C9), never the expectation evaluator: `true`
// carries the run on with no second act; `false` makes the act again only when
// it does not last, and stops a lasting one as Outcome uncertain; `unknown`
// stops the run as Outcome uncertain, as before. The same facts judge the
// attempt itself (the transition comparison): a succeeded press is checked
// against them, waiting for a page a moment late, and a lasting press whose
// facts stay false is a failure found after acting -- never pressed again.

import type { AutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../../../../../model/index.ts";
import type { AutomationStudioFactCondition } from "../../../lifecycle/index.ts";
import type { AutomationStudioHostFactResult, AutomationStudioHostRuntimeBoundary } from "../../../../host-runtime.ts";
import { runAutomationStudioGraph, type AutomationStudioGraphExecutionOptions } from "../../../index.ts";

/** A committing press the browser lost while it was in flight, as the domain reports it. */
const INTERRUPTED_COMMIT: AutomationStudioFailureRecord = { category: "ambiguous_or_unknown", code: "web.action.unknown", retryable: false, stage: "execution", effect: "ambiguous" };

/** What `done when: count at ".line" is 1` compiles to (`flow-bootstrap/script-statements/step-done-when.ts`). */
const ONE_LINE: JsonObject = { facts: [{ fact: "count", op: "count", value: 1, target: { locator: ".line" } }] };

/**
 * The page under test. `lines` is what pressing `add` leaves; `answers` says
 * how the host's fact check reads it: `page` reads the lines, `unknown` never
 * settles, `none` is a host with no fact check at all. `lateReads` is how many
 * reads still miss a line that is there.
 */
type Page = { lines: number; answers: "page" | "unknown" | "none"; lateReads: number; addsNothing: boolean; presses: string[]; factReads: AutomationStudioFactCondition[][]; expectationAsks: number };

/** `addsNothing`: a press of `add` answers success and leaves the page as it was, so the step's fact stays false. */
function page(overrides: Partial<Pick<Page, "answers" | "lateReads" | "addsNothing">> = {}): Page {
  return { lines: 0, answers: overrides.answers ?? "page", lateReads: overrides.lateReads ?? 0, addsNothing: overrides.addsNothing ?? false, presses: [], factReads: [], expectationAsks: 0 };
}

function press(id: string, parameters: JsonObject = {}, metadata: JsonObject = {}): AutomationStudioFlowNode {
  return { id, definitionId: "builtin.policy.action", parameterValues: { outputId: "activate-element", parameters: { elementId: id }, ...parameters }, metadata };
}

function edge(sourceNodeId: string, targetNodeId: string): AutomationStudioFlowEdge {
  return { id: `${sourceNodeId}.${targetNodeId}`, sourceNodeId, targetNodeId, sourcePortId: "success", targetPortId: "in" };
}

/** A step that declared a lasting consequence; `{}` is one that declared nothing, whose act does not last. */
const LASTING: JsonObject = { declaredConsequences: ["modify_existing"] };

/** start -> add -> next -> done, `add` a press (lasting unless told otherwise) whose expected state is `ONE_LINE`. */
function flow(addMetadata: JsonObject = LASTING): AutomationStudioFlowDocument {
  const nodes = [{ id: "start", definitionId: "builtin.control.start" }, press("add", { expectedState: ONE_LINE }, addMetadata), press("next"), { id: "done", definitionId: "builtin.control.end" }];
  return { schemaVersion: "0.1", flowId: "flow.expected-facts", ownerKind: "routine", ownerId: "routine.expected-facts", name: "Expected facts", createdAt: 1, updatedAt: 1, nodes, edges: nodes.slice(1).map((node, index) => edge(nodes[index]!.id, node.id)) };
}

/** Each press of `add` takes the failure `lose(n)` gives for its `n`th press, landing first when `landsBeforeLoss`. */
function options(current: Page, lose: (press: number) => AutomationStudioFailureRecord | undefined, landsBeforeLoss = false): AutomationStudioGraphExecutionOptions {
  const host: AutomationStudioHostRuntimeBoundary = {
    capabilities: [],
    expectationEvaluator: () => {
      current.expectationAsks += 1;
      return { passed: false, checkedConditionCount: 0 };
    },
    ...(current.answers === "none" ? {} : {
      factEvaluator: (conditions: readonly AutomationStudioFactCondition[]): AutomationStudioHostFactResult[] => {
        current.factReads.push([...conditions]);
        if (current.answers === "unknown") return conditions.map(() => ({ result: "unknown", capturedAt: 1 }));
        const seen = current.lateReads > 0 ? 0 : current.lines;
        current.lateReads -= 1;
        return conditions.map((condition) => ({ result: seen === condition.value ? "true" : "false", capturedAt: 1 }));
      }
    })
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
      if ((!failure || landsBeforeLoss) && !current.addsNothing) current.lines += 1;
      if (!failure) return { status: "success", route: "success", outputs: { ok: true } };
      return { status: "failed", route: "failed", message: "The browser was interrupted while this action was in flight.", failure };
    }
  };
}

const count = (current: Page, id: string) => current.presses.filter((pressed) => pressed === id).length;

describe("an uncertain act settled by the page facts its step said it leaves", () => {
  it("true: the act landed, so the run carries on with no second act", async () => {
    const current = page();
    const trace = await runAutomationStudioGraph(flow(), options(current, (n) => (n === 1 ? INTERRUPTED_COMMIT : undefined), true));

    expect(trace.status).toBe("succeeded");
    expect(count(current, "add")).toBe(1);
    expect(count(current, "next")).toBe(1);
    expect(current.lines).toBe(1);
    expect(trace.attempts.find((attempt) => attempt.nodeId === "add")).toMatchObject({ status: "failed", effectCheck: { result: "landed" }, stateHeld: { route: "success" } });
    // Asked as facts, through the batched fact check, and never as the host's expectation conditions.
    expect(current.factReads[0]).toEqual([{ fact: "count", op: "count", value: 1, target: { locator: ".line" } }]);
    expect(current.expectationAsks).toBe(0);
  });

  it("true after the page caught up: the check waits for facts a moment late", async () => {
    const current = page({ lateReads: 3 });
    const trace = await runAutomationStudioGraph(flow(), options(current, (n) => (n === 1 ? INTERRUPTED_COMMIT : undefined), true));

    expect(trace.status).toBe("succeeded");
    expect(count(current, "add")).toBe(1);
    expect(trace.attempts.find((attempt) => attempt.nodeId === "add")?.effectCheck?.result).toBe("landed");
    expect(current.factReads.length).toBeGreaterThan(2);
  });

  it("false on a lasting act: no proof it did not happen, so the run stops as Outcome uncertain with no second press", async () => {
    const current = page();
    const trace = await runAutomationStudioGraph(flow(), options(current, (n) => (n === 1 ? INTERRUPTED_COMMIT : undefined)));

    expect(trace.status).toBe("failed");
    expect(trace.message).toMatch(/^Outcome uncertain: /u);
    expect(current.presses).toEqual(["add"]);
    expect(trace.attempts.find((attempt) => attempt.nodeId === "add")?.effectCheck?.result).toBe("unknown");
  });

  it("false on an act that does not last: it did not land, so it is made again under the ordinary retry", async () => {
    const current = page();
    const trace = await runAutomationStudioGraph(flow({}), options(current, (n) => (n === 1 ? INTERRUPTED_COMMIT : undefined)));

    expect(trace.status).toBe("succeeded");
    expect(count(current, "add")).toBe(2);
    expect(current.lines).toBe(1);
    const adds = trace.attempts.filter((attempt) => attempt.nodeId === "add");
    expect(adds[0]).toMatchObject({ status: "failed", effectCheck: { result: "not_landed" }, recoveryDecision: { selected: { kind: "retry_node" } } });
    expect(adds[1]).toMatchObject({ status: "succeeded" });
  });

  it("unknown: a page that never settles the facts stops the run as Outcome uncertain, with no second act", async () => {
    const current = page({ answers: "unknown" });
    const trace = await runAutomationStudioGraph(flow(), options(current, () => INTERRUPTED_COMMIT, true));

    expect(trace.status).toBe("failed");
    expect(trace.message).toMatch(/^Outcome uncertain: /u);
    expect(current.presses).toEqual(["add"]);
    expect(trace.attempts.find((attempt) => attempt.nodeId === "add")?.effectCheck?.result).toBe("unknown");
  });

  it("unknown: a host with no fact check is not asked, and the run stops as before", async () => {
    const current = page({ answers: "none" });
    const trace = await runAutomationStudioGraph(flow(), options(current, () => INTERRUPTED_COMMIT, true));

    expect(trace.status).toBe("failed");
    expect(trace.message).toMatch(/^Outcome uncertain: /u);
    expect(current.presses).toEqual(["add"]);
    expect(current.expectationAsks).toBe(0);
  });
});

describe("the attempt judged by the same facts", () => {
  it("a lasting press that answered success while its facts stay false is a failure found after acting: never pressed again", async () => {
    const current = page({ addsNothing: true });
    const trace = await runAutomationStudioGraph(flow(), options(current, () => undefined));

    expect(trace.status).toBe("failed");
    expect(trace.message ?? "").not.toMatch(/^Outcome uncertain/u);
    expect(current.presses).toEqual(["add"]);
    const add = trace.attempts.filter((attempt) => attempt.nodeId === "add");
    expect(add).toHaveLength(1);
    expect(add[0]).toMatchObject({ status: "failed", failure: { code: "core.step.done_when_false", stage: "verification" } });
    expect(add[0]?.effectCheck).toBeUndefined();
  });

  it("accepts a succeeded press whose facts hold, after waiting for a page a moment late", async () => {
    const current = page({ lateReads: 2 });
    const trace = await runAutomationStudioGraph(flow(), options(current, () => undefined));

    expect(trace.status).toBe("succeeded");
    expect(count(current, "add")).toBe(1);
    expect(trace.attempts.find((attempt) => attempt.nodeId === "add")?.transitionComparison).toMatchObject({ status: "matched", metadata: { hostEvaluated: true }, diffSummary: { stateCheckCount: 1 } });
  });

  it("keeps a succeeded press as it was when the facts cannot be settled", async () => {
    const current = page({ answers: "unknown" });
    const trace = await runAutomationStudioGraph(flow(), options(current, () => undefined));

    expect(trace.status).toBe("succeeded");
    expect(count(current, "add")).toBe(1);
    expect(trace.attempts.find((attempt) => attempt.nodeId === "add")?.transitionComparison?.metadata).toBeUndefined();
  });
});
