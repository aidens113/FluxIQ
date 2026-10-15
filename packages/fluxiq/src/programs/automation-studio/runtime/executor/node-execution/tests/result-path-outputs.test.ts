// A data output that names where in its dispatched answer its value lies is
// filled from it (`../result-path-outputs.ts`, t646), so a later step reads one
// value an output node read as `$step.<label>.<port>`.

import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowDocument } from "../../../../model/index.ts";
import type { AutomationNodePort } from "../../../../nodes/index.ts";
import { runAutomationStudioGraph, type AutomationStudioGraphExecutionOptions } from "../../index.ts";
import { automationStudioResultPathOutputs } from "../result-path-outputs.ts";

const ROUTES: AutomationNodePort[] = [
  { id: "success", label: "Success", valueType: "any", role: "success" },
  { id: "failed", label: "Failed", valueType: "any", role: "failure" }
];
const VALUE_PORT: AutomationNodePort = { id: "value", label: "Value", valueType: "any", role: "data", resultPath: "result.read" };
const READ_PORTS = [...ROUTES, VALUE_PORT];

describe("automationStudioResultPathOutputs", () => {
  it("reads a declared data port's value at its path in the dispatched answer", () => {
    expect(automationStudioResultPathOutputs({ ok: true, result: { status: "succeeded", result: { read: "Order 4471" } } }, READ_PORTS)).toEqual({ value: "Order 4471" });
  });

  it("keeps a null the answer holds, and adds nothing when the path finds nothing", () => {
    expect(automationStudioResultPathOutputs({ result: { result: { read: null } } }, READ_PORTS)).toEqual({ value: null });
    expect(automationStudioResultPathOutputs({ result: { result: {} } }, READ_PORTS)).toEqual({});
    expect(automationStudioResultPathOutputs({ ok: true }, READ_PORTS)).toEqual({});
  });

  it("never replaces an output the dispatch or a capture already wrote", () => {
    const records: AutomationNodePort = { id: "records", label: "Records", valueType: "array", role: "data", resultPath: "result.read" };
    expect(automationStudioResultPathOutputs({ records: [{ a: "kept" }], result: { result: { read: "other" } } }, [records])).toEqual({});
  });

  it("reads nothing for a port that is not data, has no path, or whose path does not parse", () => {
    const ports: AutomationNodePort[] = [
      { id: "ended", label: "Ended", valueType: "any", role: "branch", resultPath: "result.read" },
      { id: "plain", label: "Plain", valueType: "any", role: "data" },
      { id: "broken", label: "Broken", valueType: "any", role: "data", resultPath: "result..read" }
    ];
    expect(automationStudioResultPathOutputs({ result: { result: { read: "x" } } }, ports)).toEqual({});
  });
});

describe("a later step reading the value an output node read", () => {
  const flow: AutomationStudioFlowDocument = {
    schemaVersion: "0.1",
    flowId: "flow.read-one-value",
    ownerKind: "task",
    ownerId: "task.read-one-value",
    name: "Read one value",
    createdAt: 1,
    updatedAt: 1,
    nodes: [
      { id: "node-read", definitionId: "importer.example.read", metadata: { bootstrapSymbolicKey: "s1" } },
      { id: "node-type", definitionId: "importer.example.type", metadata: { bootstrapSymbolicKey: "s2" }, parameterValues: { text: { $state: { path: "$node.s1.value" } } } }
    ],
    edges: [{ id: "read.success", sourceNodeId: "node-read", sourcePortId: "success", targetNodeId: "node-type", targetPortId: "in" }]
  };

  function run(answer: JsonValue, ports: readonly AutomationNodePort[] = READ_PORTS) {
    const dispatched: JsonValue[] = [];
    const options: AutomationStudioGraphExecutionOptions = {
      nativeNodeExecutor: ({ node }) => Promise.resolve({
        result: { status: "success", route: "success", outputs: {}, effects: [{ type: "policy.output.dispatch", payload: { outputId: node.definitionId, parameters: node.parameterValues ?? {} } }] },
        declaredOutputs: node.definitionId === "importer.example.read" ? ports : ROUTES
      }),
      effectDispatcher: (effect) => {
        dispatched.push(effect.payload ?? null);
        return dispatched.length === 1
          ? { status: "success", route: "success", outputs: { ok: true, result: answer } }
          : { status: "success", route: "success", outputs: { ok: true } };
      }
    };
    return runAutomationStudioGraph(flow, options).then((trace) => ({ trace, dispatched }));
  }

  it("hands the value on through the port, and the next step's parameter resolves to it", async () => {
    const { trace, dispatched } = await run({ status: "succeeded", result: { read: "Order 4471" } });
    expect(trace.status).toBe("succeeded");
    expect((dispatched[1] as { parameters: { text: string } }).parameters.text).toBe("Order 4471");
    // The trace the run keeps withholds a value a later step resolved out of state (`../../trace-withholding.ts`),
    // so the port is there and its value is not.
    expect(trace.attempts[0]?.outputs).toHaveProperty("value", "[withheld]");
  });

  it("keeps the value on the port in the trace when no later step resolved it", async () => {
    const alone = await runAutomationStudioGraph({ ...flow, nodes: [flow.nodes[0]!], edges: [] }, {
      nativeNodeExecutor: () => Promise.resolve({
        result: { status: "success", route: "success", outputs: {}, effects: [{ type: "policy.output.dispatch", payload: { outputId: "importer.example.read", parameters: {} } }] },
        declaredOutputs: READ_PORTS
      }),
      effectDispatcher: () => ({ status: "success", route: "success", outputs: { ok: true, result: { status: "succeeded", result: { read: "Order 4471" } } } })
    });
    expect(alone.status).toBe("succeeded");
    expect(alone.attempts[0]?.outputs.value).toBe("Order 4471");
  });

  it("leaves the port empty, and the reading step unresolved, when the answer holds no value there", async () => {
    const { trace, dispatched } = await run({ status: "succeeded", result: {} });
    expect(trace.attempts[0]?.outputs).not.toHaveProperty("value");
    expect(dispatched).toHaveLength(1);
    expect(trace.attempts[1]?.failure?.code).toBe("executor.parameter.unresolved_state_path");
  });

  it("hands nothing on through a port that declares no path, as before", async () => {
    const { trace } = await run({ status: "succeeded", result: { read: "Order 4471" } }, [...ROUTES, { id: "value", label: "Value", valueType: "any", role: "data" }]);
    expect(trace.attempts[0]?.outputs).not.toHaveProperty("value");
  });
});
