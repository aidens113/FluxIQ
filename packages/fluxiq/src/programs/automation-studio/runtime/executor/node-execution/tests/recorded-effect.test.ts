// A lasting step whose act answered success is done only if what it did
// appeared (`../recorded-effect.ts`, t476). The row that matters is the first:
// an Add to cart whose press answered success while nothing its recorded effect
// brought appeared -- `run-mv5tusj4-b7ee0630`'s s9, which the trial, the
// playback and the build's reset ledger all took as landed -- fails as not
// observed, found after acting, and is never pressed again. The rest prove the
// check judges nothing it was not asked to: a page a moment late, a host that
// cannot tell, a step judged by its own `done when:`, a step whose act does not
// last, a step with no recorded effect, and a host with no such check.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../../../../model/index.ts";
import type { AutomationStudioHostRuntimeBoundary, AutomationStudioRouteEffectSighting } from "../../../host-runtime.ts";
import { runAutomationStudioGraph, type AutomationStudioGraphExecutionOptions } from "../../index.ts";
import { AUTOMATION_STUDIO_RECORDED_EFFECT_UNSEEN_FAILURE } from "../index.ts";

/** The effect the build recorded for `add`: opaque to Core, as the host signed it. */
const ADD_EFFECT: JsonObject = { v: 1, added: ["panel-view-cart", "panel-continue", "panel-close"] };

/** A step that declared a lasting consequence, with the effect its build recorded. */
const LASTING: JsonObject = { declaredConsequences: ["create_new"], routeSignatures: { effect: ADD_EFFECT } };

/**
 * The page under test. `answers` is what the host's `routeEffectSeen` says at
 * each look, in order, the last repeated; `none` is a host with no such check.
 */
type Page = { answers: AutomationStudioRouteEffectSighting[] | "none"; presses: string[]; looks: number; asked: JsonObject[]; waits: number[] };

function page(answers: Page["answers"]): Page {
  return { answers, presses: [], looks: 0, asked: [], waits: [] };
}

function press(id: string, parameters: JsonObject = {}, metadata: JsonObject = {}): AutomationStudioFlowNode {
  return { id, definitionId: "builtin.policy.action", parameterValues: { outputId: "activate-element", parameters: { elementId: id }, ...parameters }, metadata };
}

function edge(sourceNodeId: string, targetNodeId: string): AutomationStudioFlowEdge {
  return { id: `${sourceNodeId}.${targetNodeId}`, sourceNodeId, targetNodeId, sourcePortId: "success", targetPortId: "in" };
}

/** start -> add -> next -> done. */
function flow(add: AutomationStudioFlowNode = press("add", {}, LASTING)): AutomationStudioFlowDocument {
  const nodes = [{ id: "start", definitionId: "builtin.control.start" }, add, press("next"), { id: "done", definitionId: "builtin.control.end" }];
  return { schemaVersion: "0.1", flowId: "flow.recorded-effect", ownerKind: "routine", ownerId: "routine.recorded-effect", name: "Recorded effect", createdAt: 1, updatedAt: 1, nodes, edges: nodes.slice(1).map((node, index) => edge(nodes[index]!.id, node.id)) };
}

/** Every press answers success; the page is observed as a route state, and the host says whether `add`'s effect appeared. */
function options(current: Page): AutomationStudioGraphExecutionOptions {
  const answers = current.answers;
  const host: AutomationStudioHostRuntimeBoundary = {
    capabilities: [],
    observeRouteState: () => {
      current.looks += 1;
      return { page: { path: "/product", controls: "Add to cart" } };
    },
    ...(answers === "none" ? {} : {
      routeEffectSeen: (effect: JsonObject): AutomationStudioRouteEffectSighting => {
        current.asked.push(effect);
        return answers[Math.min(current.asked.length, answers.length) - 1] ?? "unknown";
      }
    })
  };
  return {
    delay: async (ms: number) => {
      current.waits.push(ms);
    },
    now: () => 1_000,
    currentSubflowId: "main",
    hostRuntime: host,
    effectDispatcher: (effect) => {
      const id = /"elementId":"([^"]+)"/u.exec(JSON.stringify(effect.payload ?? null))?.[1] ?? "?";
      current.presses.push(id);
      return { status: "success", route: "success", outputs: { ok: true } };
    }
  };
}

describe("a lasting step held to its recorded effect", () => {
  it("an act that answered success while nothing its effect brought appeared is not done: it fails as not observed, after acting, and is never made again", async () => {
    const current = page(["not_seen"]);
    const trace = await runAutomationStudioGraph(flow(), options(current));

    expect(trace.status).toBe("failed");
    expect(trace.message ?? "").not.toMatch(/^Outcome uncertain/u);
    expect(current.presses).toEqual(["add"]);
    const add = trace.attempts.filter((attempt) => attempt.nodeId === "add");
    expect(add).toHaveLength(1);
    expect(add[0]).toMatchObject({ status: "failed", route: "failed", failure: AUTOMATION_STUDIO_RECORDED_EFFECT_UNSEEN_FAILURE });
    expect(add[0]?.transitionComparison).toMatchObject({ status: "missing_expected_state", metadata: { hostEvaluated: true } });
    expect(add[0]?.effectCheck).toBeUndefined();
    // The host was asked about the step's own recorded effect, and the page read again until the ceiling passed.
    expect(current.asked[0]).toEqual(ADD_EFFECT);
    expect(current.looks).toBeGreaterThan(1);
    expect(current.waits.every((ms) => ms > 0 && ms <= 500)).toBe(true);
  });

  it("an effect that appears a moment late is seen, and the step is done", async () => {
    const current = page(["not_seen", "not_seen", "seen"]);
    const trace = await runAutomationStudioGraph(flow(), options(current));

    expect(trace.status).toBe("succeeded");
    expect(current.presses).toEqual(["add", "next"]);
    expect(current.looks).toBe(3);
    expect(trace.attempts.find((attempt) => attempt.nodeId === "add")?.status).toBe("succeeded");
  });

  it("a host that cannot tell judges nothing: the step stands as its act answered", async () => {
    const current = page(["unknown"]);
    const trace = await runAutomationStudioGraph(flow(), options(current));

    expect(trace.status).toBe("succeeded");
    expect(current.looks).toBe(1);
  });

  it("a step judged by its own done when is not asked", async () => {
    const current = page(["not_seen"]);
    const facts: JsonObject = { facts: [{ fact: "count", op: "count", value: 1, target: { locator: ".line" } }] };
    await runAutomationStudioGraph(flow(press("add", { expectedState: facts }, LASTING)), options(current));

    expect(current.asked).toEqual([]);
  });

  it("a step whose act does not last, or that recorded no effect, is not asked", async () => {
    for (const metadata of [{ declaredConsequences: [], routeSignatures: { effect: ADD_EFFECT } }, { declaredConsequences: ["create_new"] }] as JsonObject[]) {
      const current = page(["not_seen"]);
      const trace = await runAutomationStudioGraph(flow(press("add", {}, metadata)), options(current));

      expect(trace.status).toBe("succeeded");
      expect(current.asked).toEqual([]);
      expect(current.looks).toBe(0);
    }
  });

  it("a host with no such check is not asked, and the page is not observed for it", async () => {
    const current = page("none");
    const trace = await runAutomationStudioGraph(flow(), options(current));

    expect(trace.status).toBe("succeeded");
    expect(current.looks).toBe(0);
  });
});
