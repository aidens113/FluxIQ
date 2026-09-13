import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDocument } from "../../../model/index.ts";
import { AUTOMATION_STUDIO_WITHHELD_VALUE, runAutomationStudioGraph } from "../index.ts";
import { automationStudioTraceWithholding } from "../trace-withholding.ts";

// Obviously synthetic, and deliberately self-describing: every assertion below
// is that this string is absent, so a real or realistic credential would prove
// nothing here and would itself be the leak the tests exist to prevent.
const SUPPLIED = "synthetic-state-value-that-must-never-be-persisted";

const boundParameterFlow: AutomationStudioFlowDocument = {
  schemaVersion: "0.1",
  flowId: "flow.bound-parameter",
  ownerKind: "task",
  ownerId: "task.bound-parameter",
  name: "Bound parameter",
  createdAt: 1,
  updatedAt: 1,
  nodes: [{
    id: "type",
    definitionId: "builtin.policy.action",
    parameterValues: {
      outputId: "web.dom.type",
      parameters: { selector: "#password", text: { $state: { path: "web.secret.password" } } }
    }
  }],
  edges: []
};

function dispatchPayload(effect: { payload?: JsonValue } | undefined): Record<string, JsonValue> {
  return (effect?.payload ?? {}) as Record<string, JsonValue>;
}

describe("a value resolved out of state and the persisted trace", () => {
  it("dispatches the resolved value but withholds it from every part of the trace", async () => {
    const dispatched: Record<string, JsonValue>[] = [];
    const trace = await runAutomationStudioGraph(boundParameterFlow, {
      inputs: { "web.secret.password": SUPPLIED },
      effectDispatcher: (effect) => {
        dispatched.push(dispatchPayload(effect));
        return { status: "success", route: "success", outputs: { ok: true } };
      }
    });

    // The point of resolution: the action still receives the real value.
    expect((dispatched[0]?.parameters as Record<string, JsonValue>).text).toBe(SUPPLIED);

    expect(JSON.stringify(trace)).not.toContain(SUPPLIED);
    expect(dispatchPayload(trace.effects[0]).parameters).toEqual({ selector: "#password", text: AUTOMATION_STUDIO_WITHHELD_VALUE });
    expect(dispatchPayload(trace.attempts[0]?.effects[0]).parameters).toEqual({ selector: "#password", text: AUTOMATION_STUDIO_WITHHELD_VALUE });
    // The run's own inputs carry the value into `values` and into every
    // attempt's `inputs` before any node runs, so both are withheld too.
    expect(trace.values["web.secret.password"]).toBe(AUTOMATION_STUDIO_WITHHELD_VALUE);
    expect(trace.attempts[0]?.inputs["web.secret.password"]).toBe(AUTOMATION_STUDIO_WITHHELD_VALUE);
  });

  it("keeps everything the trace needs to explain the dispatch that failed", async () => {
    const trace = await runAutomationStudioGraph(boundParameterFlow, {
      inputs: { "web.secret.password": SUPPLIED },
      effectDispatcher: () => ({
        status: "failed",
        route: "failed",
        outputs: { ok: false },
        message: `Could not type ${SUPPLIED} into #password.`,
        failure: {
          category: "timeout",
          code: "web.action.timed_out",
          retryable: true,
          stage: "dispatch",
          expected: "#password holds the requested value",
          actual: `the field still holds ${SUPPLIED}`
        }
      })
    });

    expect(JSON.stringify(trace)).not.toContain(SUPPLIED);
    expect(trace.status).toBe("failed");
    expect(trace.attempts[0]).toMatchObject({
      status: "failed",
      route: "failed",
      nodeId: "type",
      definitionId: "builtin.policy.action",
      message: `Could not type ${AUTOMATION_STUDIO_WITHHELD_VALUE} into #password.`,
      failure: {
        category: "timeout",
        code: "web.action.timed_out",
        stage: "dispatch",
        expected: "#password holds the requested value",
        actual: `the field still holds ${AUTOMATION_STUDIO_WITHHELD_VALUE}`
      }
    });
    expect(trace.attempts[0]?.transitionComparison?.status).toBe("timeout");
    expect(dispatchPayload(trace.attempts[0]?.transitionComparison?.actual.effects[0]).outputId).toBe("web.dom.type");
  });

  it("fails the node closed and names the unresolved path when nothing answers the binding", async () => {
    const dispatched: unknown[] = [];
    const trace = await runAutomationStudioGraph(boundParameterFlow, {
      effectDispatcher: (effect) => {
        dispatched.push(effect);
        return { status: "success", route: "success" };
      }
    });

    expect(dispatched).toEqual([]);
    expect(trace.status).toBe("failed");
    expect(trace.attempts[0]?.message).toBe("State-bound parameter path could not be resolved: web.secret.password.");
  });

  it("withholds a supplied value when the run fails before the bound node ever executes", async () => {
    // The bound node is never reached, so only the seed taken from the run's
    // declared bindings can know the supplied input is a resolved value.
    const flow: AutomationStudioFlowDocument = {
      ...boundParameterFlow,
      nodes: [
        { id: "open", definitionId: "builtin.policy.action", parameterValues: { outputId: "web.dom.click", parameters: { selector: "#login" } } },
        ...boundParameterFlow.nodes
      ],
      edges: [{ id: "open.type", sourceNodeId: "open", sourcePortId: "success", targetNodeId: "type", targetPortId: "in" }]
    };
    const dispatchedOutputs: JsonValue[] = [];
    const trace = await runAutomationStudioGraph(flow, {
      inputs: { "web.secret.password": SUPPLIED },
      effectDispatcher: (effect) => {
        dispatchedOutputs.push(dispatchPayload(effect).outputId ?? null);
        return { status: "failed", route: "failed", outputs: { ok: false }, message: "Could not click #login." };
      }
    });

    expect(dispatchedOutputs).toEqual(["web.dom.click"]);
    expect(trace.status).toBe("failed");
    expect(trace.attempts.map((attempt) => attempt.nodeId)).toEqual(["open"]);
    expect(JSON.stringify(trace)).not.toContain(SUPPLIED);
    expect(trace.values["web.secret.password"]).toBe(AUTOMATION_STUDIO_WITHHELD_VALUE);
  });

  it("withholds a value a binding took from an earlier node's output", async () => {
    // Nothing in the run's inputs answers this binding, so only the record taken
    // as the bound node executes can know the typed text was resolved.
    const flow: AutomationStudioFlowDocument = {
      ...boundParameterFlow,
      nodes: [
        { id: "read", definitionId: "builtin.policy.action", parameterValues: { outputId: "web.dom.extract", parameters: { selector: "#token" } } },
        { id: "type", definitionId: "builtin.policy.action", parameterValues: { outputId: "web.dom.type", parameters: { selector: "#password", text: { $state: { path: "read.token" } } } } }
      ],
      edges: [{ id: "read.type", sourceNodeId: "read", sourcePortId: "success", targetNodeId: "type", targetPortId: "in" }]
    };
    const typed: JsonValue[] = [];
    const trace = await runAutomationStudioGraph(flow, {
      effectDispatcher: (effect) => {
        const payload = dispatchPayload(effect);
        if (payload.outputId === "web.dom.extract") return { status: "success", route: "success", outputs: { token: SUPPLIED } };
        typed.push((payload.parameters as Record<string, JsonValue>).text ?? null);
        return { status: "success", route: "success", outputs: { ok: true } };
      }
    });

    expect(typed).toEqual([SUPPLIED]);
    const typeEffect = trace.effects.find((effect) => effect.nodeId === "type");
    expect(dispatchPayload(typeEffect).parameters).toEqual({ selector: "#password", text: AUTOMATION_STUDIO_WITHHELD_VALUE });
  });

  it("leaves no fragment of a withheld text that contains another, even when the shorter was resolved first", async () => {
    const inner = "synthetic-inner-state-value";
    const outer = `synthetic-outer-state-value-around-${inner}`;
    // `hint` resolves before `text`, so a rule that replaced texts in the order
    // they were recorded would cut the outer value around the inner one.
    const flow: AutomationStudioFlowDocument = {
      ...boundParameterFlow,
      nodes: [{ id: "type", definitionId: "builtin.policy.action", parameterValues: { outputId: "web.dom.type", parameters: { selector: "#password", hint: { $state: { path: "run.inner" } }, text: { $state: { path: "run.outer" } } } } }]
    };
    const trace = await runAutomationStudioGraph(flow, {
      inputs: { "run.inner": inner, "run.outer": outer },
      effectDispatcher: () => ({ status: "failed", route: "failed", outputs: { ok: false }, message: `Could not type ${outer} into #password.` })
    });

    const saved = JSON.stringify(trace);
    expect(saved).not.toContain("synthetic-outer");
    expect(saved).not.toContain("synthetic-inner");
    expect(trace.attempts[0]?.message).toBe(`Could not type ${AUTOMATION_STUDIO_WITHHELD_VALUE} into #password.`);
  });
});

describe("what the withholding treats as safe", () => {
  it("proves a value is authored by identity with the document, and withholds everything else", () => {
    const withholding = automationStudioTraceWithholding();
    withholding.record(
      { outputId: "web.dom.type", parameters: { selector: "#password", text: { $state: { path: "web.secret.password" } } } },
      { outputId: "web.dom.type", parameters: { selector: "#password", text: SUPPLIED } }
    );

    expect(withholding.apply({ values: { authored: "#password", supplied: SUPPLIED } })).toEqual({
      values: { authored: "#password", supplied: AUTOMATION_STUDIO_WITHHELD_VALUE }
    });
  });

  it("withholds a subtree it cannot line up against the document, rather than passing it through", () => {
    const withholding = automationStudioTraceWithholding();
    // One authored element, two resolved: positions no longer correspond, so
    // nothing in the resolved array is treated as authored.
    withholding.record({ headers: [{ value: "authored-literal" }] }, { headers: [{ value: "authored-literal" }, { value: SUPPLIED }] });

    expect(withholding.apply({ outputs: { first: "authored-literal", second: SUPPLIED } })).toEqual({
      outputs: { first: AUTOMATION_STUDIO_WITHHELD_VALUE, second: AUTOMATION_STUDIO_WITHHELD_VALUE }
    });
  });

  it("leaves the trace's own structure alone when a resolved value collides with it", () => {
    const withholding = automationStudioTraceWithholding();
    withholding.record({ route: { $state: { path: "run.route" } } }, { route: "failed" });

    const trace = { status: "failed", route: "failed", attemptId: "type.attempt.1", startedAt: 1, values: { note: "failed" } };

    expect(withholding.apply(trace)).toEqual({
      status: "failed",
      route: "failed",
      attemptId: "type.attempt.1",
      startedAt: 1,
      values: { note: AUTOMATION_STUDIO_WITHHELD_VALUE }
    });
  });

  it("hands a trace back untouched when the run resolved nothing", () => {
    const withholding = automationStudioTraceWithholding();
    const trace = { status: "succeeded", values: { total: 3 }, effects: [{ type: "policy.output.dispatch", payload: { outputId: "web.dom.click" } }] };

    expect(withholding.apply(trace)).toBe(trace);
  });
});
