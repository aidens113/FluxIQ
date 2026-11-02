import { expect, it } from "vitest";
import { AutomationStudioSiteResetObservation } from "../../../flow-bootstrap/reset-observation/index.ts";
import { AutomationStudioBuildToolFactories, AutomationStudioBuildToolCallbackScope, createAutomationStudioBuildToolObserver, inheritAutomationStudioBuildToolDescendant, invokeAutomationStudioBuildToolCallback, withAutomationStudioBuildToolCallbackScope } from "../index.ts";
import { buildToolFixture } from "./fixture.ts";
import { BuildToolTestHost } from "./host.ts";

it("retains original C options/root and restores the outer frame after an actual delegate", async () => {
  const host = new BuildToolTestHost();
  const f = await buildToolFixture(undefined, callbacks => callbacks.manage({ receiver: host, callback: host.executeTool, contract: "managed_direct_effects", consumeCompletion: input => host.completion(input) }));
  const request = { projectId: "project.isolated", flowId: "flow.actual", callId: "original", toolId: "core.run_node", value: {}, permission: async () => ({ permitted: true, missing: [], requestId: null }) };
  const options = Object.freeze({ original: true });
  const core = {
    async execute(call: typeof request) {
      const context = f.observer.callbackContext(call);
      const root = f.issued[0];
      const previous = AutomationStudioSiteResetObservation.of(core);
      if (!context || !root || !previous) throw new Error("test.original_frame_missing");
      expect(context.callbacks).toBe(f.callbacks);
      expect(context.toolRequest).toBe(call);
      expect(context.automation).toBeUndefined();
      const held = new AutomationStudioSiteResetObservation(core, { ...context, originalRoot: root }, options, previous);
      try {
        return await withAutomationStudioBuildToolCallbackScope(call, async () => {
          const actual = AutomationStudioSiteResetObservation.of(core);
          expect(actual?.context.originalRoot).toBe(root);
          expect(actual?.options).toBe(options);
          host.beforeCall = () => expect(AutomationStudioSiteResetObservation.of(host)).toBeUndefined();
          const result = await invokeAutomationStudioBuildToolCallback(call, { receiver: host, callback: host.executeTool, args: [call] });
          expect(AutomationStudioSiteResetObservation.of(call)?.context.parent).toBe(context.parent);
          const restored = f.observer.callbackContext(call);
          expect(restored?.parent).toBe(context.parent);
          expect(restored && f.assembly.entryBridge.read(restored.parent.parent).lifecycle).toBe("open");
          expect(AutomationStudioSiteResetObservation.of(core)).toBe(actual);
          return result;
        }, core);
      } finally {
        expect(AutomationStudioSiteResetObservation.of(core)).toBe(held);
        held.close();
      }
    }
  };
  AutomationStudioBuildToolFactories.remember(core.execute, "frame");
  await f.observer.invoke({ receiver: core, callback: core.execute, args: [request] }, request);
  expect(host.calls).toBe(1);
  expect(AutomationStudioSiteResetObservation.of(core)).toBeUndefined();
  expect(AutomationStudioSiteResetObservation.of(request)).toBeUndefined();
  expect(Object.getOwnPropertySymbols(request)).toEqual([]);
  expect(JSON.stringify(request)).not.toMatch(/observer|reservation|proof|series/u);
  expect(() => f.observer.callbackContext(request)).toThrow("execution_observation.tool_run_binding_unverified");
});

it("does not bind copied requests and rejects a foreign observer or a preparing original", async () => {
  const f = await buildToolFixture();
  let release: (() => void) | undefined;
  let entered: (() => void) | undefined;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const preparing = new Promise<void>(resolve => { entered = resolve; });
  const reader = async () => "read";
  f.callbacks.manage({ receiver: undefined, callback: reader, contract: "no_direct_effects" });
  const observer = createAutomationStudioBuildToolObserver({
    scope: f.scope, roots: f.roots, callbacks: f.callbacks,
    runBindings: {
      async issueOrdinaryRunBinding(root) {
        entered?.();
        await waiting;
        return await f.runBindings.issueOrdinaryRunBinding(root);
      },
      readOrdinaryRunBinding: f.runBindings.readOrdinaryRunBinding
    }
  });
  const request = { callId: "original" };
  const running = observer.invoke({ receiver: undefined, callback: reader, args: [] }, request);
  await preparing;
  expect(() => observer.callbackContext(request)).toThrow("execution_observation.foreign_tool_request");
  expect(() => f.observer.callbackContext(request)).toThrow("execution_observation.foreign_tool_request");
  expect(observer.callbackContext({ ...request })).toBeUndefined();
  expect(AutomationStudioBuildToolCallbackScope.open({ ...request })).toBeUndefined();
  await expect(f.observer.withCallbackScope(request, async () => "never")).rejects.toThrow("execution_observation.foreign_tool_request");
  release?.();
  expect(await running).toBe("read");
});

it("guards restoration without deleting a newer original C binding", async () => {
  const host = new BuildToolTestHost();
  const f = await buildToolFixture(undefined, callbacks => callbacks.manage({ receiver: host, callback: host.executeTool, contract: "managed_direct_effects", consumeCompletion: input => host.completion(input) }));
  const request = { projectId: "project.isolated", flowId: "flow.actual", callId: "original", toolId: "core.run_node", value: {}, permission: async () => ({ permitted: true, missing: [], requestId: null }) };
  const receiver = {};
  const execute = async () => {
    const frame = AutomationStudioBuildToolCallbackScope.open(request, receiver);
    const previous = AutomationStudioSiteResetObservation.of(receiver);
    if (!frame || !previous) throw new Error("test.original_scope_missing");
    const newer = new AutomationStudioSiteResetObservation(receiver, previous.context, previous.options, previous);
    expect(() => frame.close()).toThrow("site_reset.observation_changed");
    expect(AutomationStudioSiteResetObservation.of(receiver)).toBe(newer);
    newer.close();
    previous.close();
    expect(() => frame.close()).not.toThrow();
    return await invokeAutomationStudioBuildToolCallback(request, { receiver: host, callback: host.executeTool, args: [request] });
  };
  AutomationStudioBuildToolFactories.remember(execute, "frame");
  await f.observer.invoke({ receiver: undefined, callback: execute, args: [] }, request);
  expect(AutomationStudioSiteResetObservation.of(receiver)).toBeUndefined();
});

it("refuses an internal descendant after its original Core frame has closed", async () => {
  const host = new BuildToolTestHost();
  const f = await buildToolFixture(undefined, callbacks => callbacks.manage({ receiver: host, callback: host.executeTool, contract: "managed_direct_effects", consumeCompletion: input => host.completion(input) }));
  const request = { projectId: "project.isolated", flowId: "flow.actual", callId: "original", toolId: "core.run_node", value: {}, permission: async () => ({ permitted: true, missing: [], requestId: null }) };
  const execute = async () => await invokeAutomationStudioBuildToolCallback(request, { receiver: host, callback: host.executeTool, args: [request] });
  AutomationStudioBuildToolFactories.remember(execute, "frame");
  await f.observer.invoke({ receiver: undefined, callback: execute, args: [] }, request);
  expect(() => inheritAutomationStudioBuildToolDescendant(request, { ...request })).toThrow("execution_observation.foreign_tool_callback_scope");
  expect(host.calls).toBe(1);
});
