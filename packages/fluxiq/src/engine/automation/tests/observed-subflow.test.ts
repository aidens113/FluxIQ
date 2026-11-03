import { expect, it } from "vitest";
import { runCanonicalAutomationStudioFlow, type AutomationStudioCompositeFlow } from "../composite/index.ts";
import { automationStudioRootInvocation, type AutomationStudioSubflowGraph } from "../frames/index.ts";
import { copyAutomationExecutionOptions } from "../execution-admission/index.ts";
import { automationObservationFixture } from "../execution-admission/tests/fixture.ts";

const child: AutomationStudioSubflowGraph = {
  subflowId: "controlled.child", graphRevision: 1,
  graph: { flowId: "controlled.child", nodes: [{ id: "value", definitionId: "builtin.data.constant", parameterValues: { value: "controlled child value" } }], edges: [] }
};
const parent: AutomationStudioCompositeFlow = {
  flowId: "controlled.parent", scope: { kind: "global" },
  nodes: [{ id: "call", definitionId: "builtin.control.call-subflow", parameterValues: { subflowId: child.subflowId, outputs: { "value.value": "answer" } } }], edges: []
};

it("completes the actual canonical child with only the original Core trace capture declared", async () => {
  const f = await automationObservationFixture();
  const options = copyAutomationExecutionOptions(f.options, { subflowGraphs: { load: async () => child } });
  options.invocation = automationStudioRootInvocation(parent, options, (target, placed, capture) =>
    runCanonicalAutomationStudioFlow({ ...target.graph, scope: { kind: "global" } }, [], placed, [], capture));
  const trace = await runCanonicalAutomationStudioFlow(parent, [], options);
  expect(trace.status).toBe("succeeded");
  expect(trace.values.answer).toBe("controlled child value");
  expect(trace.attempts[0]?.childTrace?.status).toBe("succeeded");
  expect([...f.store.rows.values()].filter(row => row.row.sourceKey === "automation.engine").every(row => row.closed)).toBe(true);
  await f.rootPorts.producer.finish(f.reserved.root, f.root.complete(f.origin));
  await f.authority.consumer.release(f.reserved.reservation);
  expect((await f.authority.consumer.inspect(f.scope)).state).toBe("clear");
});

it("keeps a supplied executed-trace callback unsupported after its first actual effect", async () => {
  const f = await automationObservationFixture();
  let writes = 0;
  const supplied = () => { writes++; };
  const trace = await runCanonicalAutomationStudioFlow({ ...child.graph, scope: { kind: "global" } }, [], f.options, [], supplied);
  expect(trace.status).toBe("succeeded");
  expect(writes).toBe(1);
  expect([...f.store.rows.values()].some(row => row.facts.some(fact => fact.kind === "returned_unverified"))).toBe(true);
  await expect(f.rootPorts.producer.finish(f.reserved.root, f.root.complete(f.origin))).rejects.toThrow();
  await f.authority.consumer.release(f.reserved.reservation);
  expect((await f.authority.consumer.inspect(f.scope)).state).toBe("pending");
  expect(writes).toBe(1);
});
