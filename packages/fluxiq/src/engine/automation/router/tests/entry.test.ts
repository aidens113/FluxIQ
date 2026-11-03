import { expect, it } from "vitest";
import type { AutomationStudioFlowRouter, AutomationStudioFlowSubflow } from "../../../../flows/authoring/routing/index.ts";
import type { AutomationStudioHostRuntimeBoundary } from "../../../../runtime/automation-host/index.ts";
import { hasObservedExecutionFrame } from "../../../../runtime/execution-observation/index.ts";
import { copyAutomationExecutionOptions } from "../../execution-admission/index.ts";
import { automationCallbackObservation } from "../../execution-admission/kernel/index.ts";
import { enteredAutomationFrameFixture } from "../../tests/observed-frame.ts";
import { routeAutomationStudioRun, routeAutomationStudioRunWithOptions } from "../index.ts";

type RoutingInput = Parameters<typeof routeAutomationStudioRun>[0];

function routingInput(hostRuntime?: AutomationStudioHostRuntimeBoundary): RoutingInput {
  const subflow: AutomationStudioFlowSubflow = { schemaVersion: "0.1", subflowId: "subflow.actual", flowId: "flow.actual", projectId: "project.actual", name: "Selected", role: "primary", status: "active", graphFlowId: "graph.actual", createdAt: 1, updatedAt: 1, metadata: { completeTarget: true } };
  const router: AutomationStudioFlowRouter = { schemaVersion: "0.1", routerId: "router.actual", flowId: "flow.actual", projectId: "project.actual", name: "Router", status: "active", createdAt: 1, updatedAt: 1, rules: [{ schemaVersion: "0.1", ruleId: "rule.actual", routerId: "router.actual", name: "Ready", order: 1, status: "active", createdAt: 1, updatedAt: 1, target: { kind: "subflow", subflowId: subflow.subflowId }, condition: { signalPath: "state.ready", operator: "equals", expected: true } }] };
  return { projectId: "project.actual", flowId: "flow.actual", router, subflows: [subflow], callerState: { ready: false, callerValue: "PRIVATE-STATE-SENTINEL" }, ...(hostRuntime ? { hostRuntime } : {}), now: () => 17 };
}

it("enters the real driver before observing with copied candidate options and the original private host", async () => {
  const f = await enteredAutomationFrameFixture();
  const controller = new AbortController();
  class Host {
    readonly capabilities = [];
    #reads = 0;
    async observeRouteState(request: { projectId: string; flowId: string; signal?: AbortSignal }) {
      this.#reads++;
      expect(request).toEqual({ projectId: "project.actual", flowId: "flow.actual", signal: controller.signal });
      expect(f.store.events.at(-1)).toBe("enter");
      return { ready: true };
    }
    get reads() { return this.#reads; }
  }
  const host = new Host();
  f.options.hostRuntime = host;
  f.engine.manage({ receiver: host, callback: host.observeRouteState, contract: "no_direct_effects" });
  const input = routingInput(host);
  input.signal = controller.signal;
  delete input.now;
  const options = copyAutomationExecutionOptions(f.options);
  const paused = f.store.pauseNext("enter");
  const running = routeAutomationStudioRunWithOptions(input, options);
  await paused.entered;
  expect(host.reads).toBe(0);
  paused.release();
  const result = await running;
  expect(result).toMatchObject({ status: "running", decision: { selectedRuleId: "rule.actual", metadata: { routeState: { observed: true, paths: ["state.ready"] } } } });
  expect(Number.isFinite(result.decision.decidedAt)).toBe(true);
  expect(result.selectedSubflow).toBe(input.subflows[0]);
  expect(host.reads).toBe(1);
  expect(JSON.stringify(result.decision.metadata)).not.toContain("PRIVATE-STATE-SENTINEL");
  expect([...f.store.rows.values()].filter(row => row.row.sourceKey === "automation.engine")).toHaveLength(2);
  await f.rootPorts.producer.finish(f.reserved.root, f.root.complete(f.origin));
  await f.authority.consumer.release(f.reserved.reservation);
  expect((await f.authority.consumer.inspect(f.scope)).state).toBe("clear");
});

it.each(["own", "inherited"] as const)("fences a %s host accessor under an actual routing frame, including after reopen", async placement => {
  const f = await enteredAutomationFrameFixture();
  let reads = 0;
  let acts = 0;
  const owner = { capabilities: [] as string[] };
  const host = placement === "own" ? owner : Object.create(owner) as typeof owner;
  Object.defineProperty(owner, "observeRouteState", { get() {
    reads++;
    return async () => {
      acts++;
      return { ready: true };
    };
  } });
  const input = routingInput(host);
  await expect(routeAutomationStudioRunWithOptions(input, f.options)).rejects.toThrow("callback_accessor_unsupported");
  expect(reads).toBe(0);
  expect(acts).toBe(0);
  expect([...f.store.rows.values()].some(row => row.row.sourceKey === "automation.engine")).toBe(true);
  await f.pending();
  expect(acts).toBe(0);
});

it("refuses a raw bound companion with no callback frame instead of silently routing unobserved", async () => {
  const f = await enteredAutomationFrameFixture();
  let calls = 0;
  const host = { capabilities: [], observeRouteState: async () => {
    calls++;
    return { ready: true };
  } };
  const observation = automationCallbackObservation(f.options);
  expect(observation).toBeDefined();
  expect(hasObservedExecutionFrame(observation!)).toBe(false);
  await expect(routeAutomationStudioRun(routingInput(host), observation)).rejects.toThrow("durable_frame_missing");
  expect(calls).toBe(0);
  expect([...f.store.rows.values()].filter(row => row.row.sourceKey === "automation.engine")).toHaveLength(0);
});

it("keeps ordinary fresh options on the explicit unobserved legacy path", async () => {
  const f = await enteredAutomationFrameFixture();
  let reads = 0;
  let calls = 0;
  const host = { capabilities: [], get observeRouteState() {
    reads++;
    return async function(this: unknown) {
      expect(this).toBe(host);
      calls++;
      return { ready: true };
    };
  } };
  const result = await routeAutomationStudioRunWithOptions(routingInput(host), {});
  expect(result.status).toBe("running");
  expect(result.decision.decidedAt).toBe(17);
  expect(reads).toBe(1);
  expect(calls).toBe(1);
  expect([...f.store.rows.values()].filter(row => row.row.sourceKey === "automation.engine")).toHaveLength(0);
});

it("keeps an arbitrary successful clock unverified for the actual spread receiver", async () => {
  const f = await enteredAutomationFrameFixture();
  const host = { capabilities: [], observeRouteState: async () => ({ ready: true }) };
  f.options.hostRuntime = host;
  f.engine.manage({ receiver: host, callback: host.observeRouteState, contract: "no_direct_effects" });
  const input = routingInput(host);
  let calls = 0;
  input.now = function(this: unknown) {
    calls++;
    expect(this).not.toBe(input);
    expect((this as { router: unknown }).router).toBe(input.router);
    return 17;
  };
  const result = await routeAutomationStudioRunWithOptions(input, f.options);
  expect(result).toMatchObject({ status: "running", decision: { decidedAt: 17 } });
  expect(calls).toBe(1);
  await f.pending();
});

it("retains a pending fence when the native clock changes after the original observed host yields", async () => {
  const f = await enteredAutomationFrameFixture();
  const descriptor = Object.getOwnPropertyDescriptor(Date, "now")!;
  let reads = 0;
  let calls = 0;
  const host = { capabilities: [], observeRouteState: async () => {
    calls++;
    await Promise.resolve();
    Object.defineProperty(Date, "now", { configurable: true, get() {
      reads++;
      return () => 99;
    } });
    return { ready: true };
  } };
  f.engine.manage({ receiver: host, callback: host.observeRouteState, contract: "no_direct_effects" });
  const input = routingInput(host);
  delete input.now;
  let caught: unknown;
  try { await routeAutomationStudioRunWithOptions(input, f.options); }
  catch (error) { caught = error; }
  finally { Object.defineProperty(Date, "now", descriptor); }
  expect(caught).toBeInstanceOf(Error);
  expect(reads).toBe(0);
  expect(calls).toBe(1);
  await expect(routeAutomationStudioRunWithOptions(input, f.options)).rejects.toThrow();
  expect(calls).toBe(1);
  await f.pending();
});
