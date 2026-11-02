import { expect, it } from "vitest";
import { AdmissionTestSource } from "../../../../../../runtime/execution-admission/tests/source.ts";
import type { PreparedExecutionCallback } from "../../../../../../runtime/execution-observation/index.ts";
import { automationStudioHarnessOptionRegistry } from "../../../llm/harness-options/index.ts";
import { bindAutomationStudioObservedBuildTools } from "../../bind-tools.ts";
import { inheritAutomationStudioBuildToolRequest, invokeAutomationStudioBuildToolCallback } from "../index.ts";
import { buildToolFixture } from "./fixture.ts";
import { BuildToolTestHost } from "./host.ts";

it.each([false, true])("keeps admitted tools under their original root and scopes retry identity (retry=%s)", async retry => {
  const host = new BuildToolTestHost();
  const f = await buildToolFixture(undefined, callbacks => {
    if (!retry) callbacks.manage({ receiver: host, callback: host.executeTool, contract: "managed_direct_effects", consumeCompletion: input => host.completion(input) });
  });
  const tools = automationStudioHarnessOptionRegistry({ binding: host, nodeIds: ["example.action"] }).evidenceLoopBinding({ projectId: "project.isolated", flowId: "flow.actual" }, { scope: { kind: "domain", domainId: "example" }, allowSideEffectsWithoutPolicy: true });
  bindAutomationStudioObservedBuildTools(tools, f.observer);
  const owner = new AdmissionTestSource(f.scope, "test.original.parent");
  owner.delegatesTo.push(f.callbacks.owner);
  const ports = f.assembly.registerSource(owner);
  const origin = owner.origin();
  const reserved = await f.assembly.consumer.reserve(f.scope, ports.issuer.fromOrdinaryAdmission(owner.admit(origin)));
  let entered: PreparedExecutionCallback | undefined;
  const callback = async () => {
    if (!entered) throw new Error("test.original_entered_parent_missing");
    const parent = f.callbacks.context(entered);
    const scopeOptions = {};
    await f.observer.prepareParent(scopeOptions, parent, reserved.root);
    const first = { callId: "call.first", toolId: "core.run_node", value: { node: "example.action", parameter: "one" } };
    f.observer.bindParent(first, parent, scopeOptions);
    await tools.executeTool(first);
    const second = { callId: "call.second", toolId: "core.run_node", value: { node: "example.action", parameter: "two" } };
    if (retry) {
      const actual = host.requests[0];
      if (!actual) throw new Error("test.original_backend_request_missing");
      const scheduled = { ...actual, callId: "call.retry" };
      inheritAutomationStudioBuildToolRequest(actual, scheduled);
      await expect(invokeAutomationStudioBuildToolCallback(scheduled, { receiver: host, callback: host.executeTool, args: [scheduled] })).rejects.toThrow("execution_observation.unverified_backend_retry");
    } else {
      f.observer.bindParent(second, parent, scopeOptions);
      await tools.executeTool(second);
    }
    expect(host.calls).toBe(retry ? 1 : 2);
  };
  const identity = { receiver: undefined, callback };
  f.callbacks.manage({ ...identity, contract: "managed_direct_effects", consumeCompletion: ({ invocation }) => f.callbacks.frameCompletion(invocation, f.callbacks.owner) });
  entered = await f.callbacks.prepare(f.callbacks.forParent({ reservation: reserved.reservation, parent: reserved.root }), identity);
  try {
    await f.callbacks.invoke(entered, { ...identity, args: [] });
    expect([...f.store.rows.values()].filter(value => value.row.sourceKey === "studio.build.tools")).toHaveLength(0);
    expect(f.issued).toHaveLength(1);
    expect(f.issued[0]).toBe(reserved.root);
    expect([...f.store.rows.values()].every(value => value.row.rootId === f.assembly.entryBridge.read(reserved.root).row.rootId)).toBe(true);
    expect(f.assembly.entryBridge.read(reserved.root).lifecycle).toBe(retry ? "blocked" : "open");
    if (!retry) await ports.producer.finish(reserved.root, owner.complete(origin));
    expect((await f.assembly.consumer.inspect(f.scope)).state).toBe(retry ? "pending" : "clear");
  } finally {
    await f.assembly.consumer.release(reserved.reservation);
  }
});
