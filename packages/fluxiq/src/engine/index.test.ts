import { describe, expect, it } from "vitest";
import { ComponentRegistry } from "../components/index.ts";
import type { FlowDocument } from "../flows/index.ts";
import { createEnvelope, IoRegistry } from "../io/index.ts";
import {
  chooseNextEdge,
  createRuntimeSession,
  runFlow,
  stepFlow
} from "./index.ts";

describe("flow engine", () => {
  it("chooses matching edges by priority then probability", () => {
    const flow: FlowDocument = {
      id: "test",
      start: "a",
      nodes: [
        { id: "a", type: "test.success" },
        { id: "b", type: "test.success" },
        { id: "c", type: "test.success" }
      ],
      edges: [
        { from: "a", to: "b", when: "success", priority: 1, probability: 0.9 },
        { from: "a", to: "c", when: "success", priority: 2, probability: 0.1 }
      ]
    };

    expect(chooseNextEdge(flow, "a", "success")?.to).toBe("c");
  });

  it("steps from one node to the next on success", async () => {
    const components = testRegistry();
    const session = createRuntimeSession({ sessionId: "s1", flow: twoNodeFlow() });

    const result = await stepFlow({ session, components });

    expect(result.previousNodeId).toBe("start");
    expect(result.nextNodeId).toBe("done");
    expect(result.terminal).toBe(false);
    expect(session.state.currentNodeId).toBe("done");
  });

  it("completes when a successful node has no matching edge", async () => {
    const components = testRegistry();
    const session = createRuntimeSession({ sessionId: "s1", flow: twoNodeFlow() });

    await stepFlow({ session, components });
    const result = await stepFlow({ session, components });

    expect(result.terminal).toBe(true);
    expect(result.nextNodeId).toBeNull();
    expect(session.mode).toBe("completed");
  });

  it("fails when a node returns failed with no matching edge", async () => {
    const components = testRegistry();
    const flow: FlowDocument = {
      id: "test",
      start: "start",
      nodes: [{ id: "start", type: "test.fail" }],
      edges: []
    };
    const session = createRuntimeSession({ sessionId: "s1", flow });

    const result = await stepFlow({ session, components });

    expect(result.terminal).toBe(true);
    expect(session.mode).toBe("failed");
  });

  it("runs until terminal", async () => {
    const components = testRegistry();
    const session = createRuntimeSession({ sessionId: "s1", flow: twoNodeFlow() });

    await runFlow({ session, components });

    expect(session.mode).toBe("completed");
    expect(session.state.tick).toBe(2);
  });

  it("provides IO helpers to node handlers", async () => {
    const components = new ComponentRegistry();
    components.register({
      spec: {
        nodeType: "test.io",
        displayName: "IO",
        category: "Tests",
        description: "Uses runtime IO",
        params: [],
        resultStates: ["success"],
        requiredInputs: ["state"],
        requiredOutputs: ["action"]
      },
      handler: async (context) => {
        const state = await context.inputs?.read<{ ready: boolean }>("state");
        const result = await context.outputs?.dispatch("action", { command: "go" });
        return state?.payload.ready && result?.ok ? { state: "success" } : { state: "failed" };
      }
    });
    const io = new IoRegistry();
    io.register({
      domainId: "example",
      inputs: [{
        definition: { id: "state", title: "State" },
        mode: "request",
        read: () => createEnvelope({ domainId: "example", ioId: "state", payload: { ready: true } })
      }],
      outputs: [{
        definition: { id: "action", title: "Action" },
        mode: "request",
        dispatch: (request) => ({ ok: true, domainId: request.domainId ?? null, outputId: request.outputId })
      }]
    });
    const flow: FlowDocument = {
      id: "test",
      domainId: "example",
      start: "start",
      nodes: [{ id: "start", type: "test.io" }],
      edges: []
    };
    const session = createRuntimeSession({ sessionId: "s1", flow });

    await runFlow({ session, components, io });

    expect(session.mode).toBe("completed");
  });

  it("fails before running a node when required IO is missing", async () => {
    const components = new ComponentRegistry();
    components.register({
      spec: {
        nodeType: "test.missing-io",
        displayName: "Missing IO",
        category: "Tests",
        description: "Requires missing IO",
        params: [],
        resultStates: ["success"],
        requiredInputs: ["state"]
      },
      handler: () => ({ state: "success" })
    });
    const flow: FlowDocument = {
      id: "test",
      domainId: "example",
      start: "start",
      nodes: [{ id: "start", type: "test.missing-io" }],
      edges: []
    };
    const session = createRuntimeSession({ sessionId: "s1", flow });

    const result = await stepFlow({ session, components, io: new IoRegistry() });

    expect(result.terminal).toBe(true);
    expect(session.mode).toBe("failed");
    expect(session.lastResult?.message).toContain("Required input");
  });
});

function testRegistry(): ComponentRegistry {
  const registry = new ComponentRegistry();
  registry.register({
    spec: {
      nodeType: "test.success",
      displayName: "Success",
      category: "Tests",
      description: "Test success",
      params: [],
      resultStates: ["success"]
    },
    handler: () => ({ state: "success" })
  });
  registry.register({
    spec: {
      nodeType: "test.fail",
      displayName: "Fail",
      category: "Tests",
      description: "Test fail",
      params: [],
      resultStates: ["failed"]
    },
    handler: () => ({ state: "failed" })
  });
  return registry;
}

function twoNodeFlow(): FlowDocument {
  return {
    id: "test",
    start: "start",
    nodes: [
      { id: "start", type: "test.success" },
      { id: "done", type: "test.success" }
    ],
    edges: [{ from: "start", to: "done", when: "success" }]
  };
}
