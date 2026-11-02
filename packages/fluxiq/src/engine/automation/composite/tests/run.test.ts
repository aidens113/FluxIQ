import { describe, expect, it } from "vitest";
import { captureExecutableFlowSnapshot, createCallFlowNode } from "../../../../flows/executable/composite/index.ts";
import type { AutomationStudioExecutorCommandRun } from "../../command-scope/index.ts";
import { AutomationStudioCanonicalExecution, runCanonicalAutomationStudioFlow, type AutomationStudioCompositeFlow } from "../index.ts";

function composition(scope: { kind: "global" } | { kind: "domain"; domainId: string } = { kind: "global" }) {
  const snapshot = captureExecutableFlowSnapshot({
    flowId: "flow.child", scope,
    interface: { inputs: [], outputs: [{ id: "value", name: "Value", valueType: { kind: "number" } }] },
    errors: [], nodes: [{ id: "constant", definitionId: "builtin.data.constant", parameterValues: { value: 9 } }], edges: []
  }, "1.0.0");
  const flow: AutomationStudioCompositeFlow = {
    flowId: "flow.root", scope: { kind: "global" },
    nodes: [createCallFlowNode({ id: "call", target: { flowId: snapshot.flowId, version: snapshot.version, scope }, outputBindings: [{ targetPortId: "value", valueKey: "answer" }] })],
    edges: []
  };
  return { flow, snapshot };
}

describe("composite execution from executable facts", () => {
  it("executes a pinned snapshot with no project, publication, editor, or named document envelope", async () => {
    const { flow, snapshot } = composition();
    const trace = await runCanonicalAutomationStudioFlow(flow, [snapshot]);
    expect(trace.status).toBe("succeeded");
    expect(trace.values.answer).toBe(9);
    expect(trace.attempts[0]?.childTrace?.status).toBe("succeeded");
    expect(trace.attempts[0]?.compositeTarget).toEqual({ flowId: snapshot.flowId, version: "1.0.0", flowDigest: snapshot.flowDigest });
    expect(Object.keys(flow).sort()).toEqual(["edges", "flowId", "nodes", "scope"]);
    expect(Object.hasOwn(snapshot, "publishedAt")).toBe(false);
  });

  it("preserves explicitly undefined stored optionals while projecting valid compilation arguments", async () => {
    const { flow, snapshot } = composition();
    const source: AutomationStudioCompositeFlow = { ...flow, executionDefaults: undefined, regions: undefined, regionHandoffs: undefined };
    const before = structuredClone(snapshot);
    const trace = await runCanonicalAutomationStudioFlow(source, [snapshot]);
    expect(trace.status).toBe("succeeded");
    for (const key of ["executionDefaults", "regions", "regionHandoffs"]) {
      expect(source).toHaveProperty(key, undefined);
    }
    expect(snapshot).toEqual(before);
  });

  it("runs nested pinned composites against the same supplied snapshot catalogue", async () => {
    const { snapshot: leaf } = composition();
    const middle = captureExecutableFlowSnapshot({
      flowId: "flow.middle", scope: { kind: "global" }, interface: leaf.interface, errors: [],
      nodes: [createCallFlowNode({ id: "nested", target: { flowId: leaf.flowId, version: leaf.version, scope: leaf.scope }, outputBindings: [{ targetPortId: "value", valueKey: "value" }] })],
      edges: []
    }, "2.0.0");
    const flow: AutomationStudioCompositeFlow = {
      flowId: "flow.nested-root", scope: { kind: "global" },
      nodes: [createCallFlowNode({ id: "outer", target: { flowId: middle.flowId, version: middle.version, scope: middle.scope }, outputBindings: [{ targetPortId: "value", valueKey: "answer" }] })], edges: []
    };
    const trace = await runCanonicalAutomationStudioFlow(flow, [middle, leaf]);
    expect(trace.status).toBe("succeeded");
    expect(trace.values.answer).toBe(9);
    const nested = trace.attempts[0]?.childTrace?.attempts[0];
    expect(nested?.childTrace?.status).toBe("succeeded");
    expect(nested?.compositeTarget).toEqual({ flowId: leaf.flowId, version: leaf.version, flowDigest: leaf.flowDigest });
  });

  it("requires both the root's explicit grant and the host's bound domain authority", async () => {
    const { flow, snapshot } = composition({ kind: "domain", domainId: "inventory" });
    const granted = { ...flow, executionDefaults: { authorizedDomainIds: ["inventory"] } };
    const unbound = await runCanonicalAutomationStudioFlow(granted, [snapshot]);
    const undeclared = await runCanonicalAutomationStudioFlow(flow, [snapshot], { authorizedDomainIds: ["inventory"] });
    const authorized = await runCanonicalAutomationStudioFlow(granted, [snapshot], { authorizedDomainIds: ["inventory"] });
    expect(unbound.status).toBe("failed");
    expect(unbound.message).toContain("flow.cross_scope_call_not_authorized");
    expect(undeclared.status).toBe("failed");
    expect(undeclared.message).toContain("flow.cross_scope_call_not_authorized");
    expect(authorized.status).toBe("succeeded");
  });

  it("registers its actual executor callback with the sole private provenance authority", async () => {
    const { flow, snapshot } = composition();
    const callbacks: object[] = [];
    const commandRun: AutomationStudioExecutorCommandRun = {
      signal: new AbortController().signal,
      acceptsComposite: (callback) => {
        callbacks.push(callback);
        return AutomationStudioCanonicalExecution.isRegistered(callback);
      },
      own: (start) => start(),
      checkpoint: async () => undefined,
      context: async () => { throw new Error("No command is expected from a constant child."); },
      consume: async () => { throw new Error("No command consumption is expected."); },
      stop: async () => { throw new Error("Registered pure composition must not stop the command run."); },
      receipted: () => false,
      withdraw: () => false
    };
    const trace = await runCanonicalAutomationStudioFlow(flow, [snapshot], { commandRun });
    expect(trace.status).toBe("succeeded");
    expect(callbacks.length).toBeGreaterThan(0);
    expect(callbacks.every((callback) => AutomationStudioCanonicalExecution.isRegistered(callback))).toBe(true);
    expect(AutomationStudioCanonicalExecution.isRegistered(() => undefined)).toBe(false);
  });
});
