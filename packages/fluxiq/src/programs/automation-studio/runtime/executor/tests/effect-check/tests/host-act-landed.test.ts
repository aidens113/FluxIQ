// A committing act whose answer was lost, on a step that declares no expected
// state (t430): the step's own `consequences: none` never unlocks a second act
// (the domain states which acts commit, and a model under-declares), so the
// effect check asks the host, which judges the act from the page. A press of a
// notice's "Not now" whose layer is gone landed, and the run carries on with no
// second press; one whose layer is still shown did not, and is pressed again;
// a page that cannot say stops the run as Outcome uncertain, as before
// (recovery matrix row 9, t404).

import type { AutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../../../../../model/index.ts";
import type { AutomationStudioHostActLanding, AutomationStudioHostActLandedInput, AutomationStudioHostRuntimeBoundary } from "../../../../host-runtime.ts";
import { runAutomationStudioGraph, type AutomationStudioGraphExecutionOptions } from "../../../index.ts";

/** A committing press whose acknowledgement timed out, as the domain states it. */
const TIMED_OUT_PRESS: AutomationStudioFailureRecord = { category: "timeout", code: "web.action.timeout", retryable: true, stage: "execution", effect: "ambiguous" };

/** A step that declared `consequences: none`. */
const DECLARED_NONE: JsonObject = { declaredConsequences: [] };

function press(id: string, parameters: JsonObject = {}, metadata: JsonObject = {}): AutomationStudioFlowNode {
  return { id, definitionId: "builtin.policy.action", parameterValues: { outputId: "activate-element", parameters: { elementId: id }, ...parameters }, metadata };
}

function edge(sourceNodeId: string, targetNodeId: string): AutomationStudioFlowEdge {
  return { id: `${sourceNodeId}.${targetNodeId}`, sourceNodeId, targetNodeId, sourcePortId: "success", targetPortId: "in" };
}

/** start -> dismiss -> next -> done; `dismiss` declares `metadata` and carries the `parameters` given. */
function flow(metadata: JsonObject = DECLARED_NONE, parameters: JsonObject = {}): AutomationStudioFlowDocument {
  const nodes = [{ id: "start", definitionId: "builtin.control.start" }, press("dismiss", parameters, metadata), press("next"), { id: "done", definitionId: "builtin.control.end" }];
  return { schemaVersion: "0.1", flowId: "flow.host-act-landed", ownerKind: "routine", ownerId: "routine.host-act-landed", name: "Host act landed", createdAt: 1, updatedAt: 1, nodes, edges: nodes.slice(1).map((node, index) => edge(nodes[index]!.id, node.id)) };
}

type Page = { presses: string[]; asked: AutomationStudioHostActLandedInput[] };

/** The first press of `dismiss` loses its answer; the host answers `landing`, has no such check (`none`), or throws. */
function options(current: Page, landing: AutomationStudioHostActLanding | "none" | "throws"): AutomationStudioGraphExecutionOptions {
  const host: AutomationStudioHostRuntimeBoundary = {
    capabilities: [],
    ...(landing === "none" ? {} : {
      actLanded: (input: AutomationStudioHostActLandedInput) => {
        current.asked.push(input);
        if (landing === "throws") throw new Error("the page did not answer");
        return landing;
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
      const first = id === "dismiss" && current.presses.filter((pressed) => pressed === "dismiss").length === 1;
      if (!first) return { status: "success", route: "success", outputs: { ok: true } };
      return { status: "failed", route: "failed", message: "The press was sent and its answer timed out.", failure: TIMED_OUT_PRESS };
    }
  };
}

const page = (): Page => ({ presses: [], asked: [] });
const count = (current: Page, id: string) => current.presses.filter((pressed) => pressed === id).length;

describe("a committing act with no expected state, settled by the host from the page", () => {
  it("landed: the layer is gone, so the run carries on with no second press", async () => {
    const current = page();
    const trace = await runAutomationStudioGraph(flow(), options(current, "landed"));

    expect(trace.status).toBe("succeeded");
    expect(count(current, "dismiss")).toBe(1);
    expect(count(current, "next")).toBe(1);
    expect(trace.attempts.find((attempt) => attempt.nodeId === "dismiss")).toMatchObject({ status: "failed", effectCheck: { result: "landed" } });
    expect(current.asked).toHaveLength(1);
    expect(current.asked[0]).toMatchObject({ node: { id: "dismiss" }, attemptId: expect.any(String) });
    expect(current.asked[0]!.timeoutMs).toBeGreaterThan(0);
  });

  it("not_landed: the layer is still shown, so the press is made again under the ordinary retry", async () => {
    const current = page();
    const trace = await runAutomationStudioGraph(flow(), options(current, "not_landed"));

    expect(trace.status).toBe("succeeded");
    expect(count(current, "dismiss")).toBe(2);
    const dismissals = trace.attempts.filter((attempt) => attempt.nodeId === "dismiss");
    expect(dismissals[0]).toMatchObject({ status: "failed", effectCheck: { result: "not_landed" }, recoveryDecision: { selected: { kind: "retry_node" } } });
    expect(dismissals[1]).toMatchObject({ status: "succeeded" });
  });

  it("unknown: the step's `consequences: none` does not unlock a second press, and the run stops as Outcome uncertain", async () => {
    for (const landing of ["unknown", "none", "throws"] as const) {
      const current = page();
      const trace = await runAutomationStudioGraph(flow(), options(current, landing));

      expect(trace.status, landing).toBe("failed");
      expect(trace.message, landing).toMatch(/^Outcome uncertain: /u);
      expect(current.presses, landing).toEqual(["dismiss"]);
      expect(trace.attempts.find((attempt) => attempt.nodeId === "dismiss")?.effectCheck?.result, landing).toBe("unknown");
    }
  });

  it("is not asked about a node whose step said what it leaves: its expected state decides", async () => {
    const current = page();
    const trace = await runAutomationStudioGraph(flow({ declaredConsequences: ["modify_existing"] }, { expectedState: { facts: [{ fact: "dialog", op: "absent" }] } }), options(current, "not_landed"));

    expect(trace.status).toBe("failed");
    expect(current.asked).toHaveLength(0);
    expect(current.presses).toEqual(["dismiss"]);
  });
});
