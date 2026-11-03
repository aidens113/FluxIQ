import { describe, expect, it } from "vitest";
import type { AutomationStudioGraphExecutionOptions } from "../../contracts/index.ts";
import { automationStudioLiveRunEnvironment } from "../../../../runtime/environment/index.ts";
import { createExecutionAdmissionAuthority } from "../../../../runtime/execution-admission/index.ts";
import { AdmissionTestSource } from "../../../../runtime/execution-admission/tests/source.ts";
import { captureHostState } from "../../host-state/index.ts";
import { automationStudioRunState } from "../../state/index.ts";
import { runAutomationStudioGraph } from "../../graph-run.ts";
import { copyAutomationExecutionOptions } from "../index.ts";
import { AutomationPureCallbacks, automationExecutionClock, invokeAutomationCallbackSync, invokeAutomationEffect, invokeAutomationFrame, invokeAutomationNative, prepareAutomationFrame, registerAutomationExecutionKernel } from "../kernel/index.ts";
import { automationObservationFixture } from "./fixture.ts";

async function enteredFrame(options: AutomationStudioGraphExecutionOptions, work: (options: AutomationStudioGraphExecutionOptions) => Promise<void>): Promise<void> {
  const body = async (placed: AutomationStudioGraphExecutionOptions) => await work(placed);
  const identity = { receiver: undefined, callback: body };
  const kernel = registerAutomationExecutionKernel(undefined, body, "graph");
  const frame = await prepareAutomationFrame(options, identity, kernel);
  if (!frame) throw new Error("test.observed_frame_missing");
  await invokeAutomationFrame(frame, { ...identity, args: [frame.options] });
}

async function refusesAfterReopen(f: Awaited<ReturnType<typeof automationObservationFixture>>): Promise<void> {
  await expect(f.rootPorts.producer.finish(f.reserved.root, f.root.complete(f.origin))).rejects.toThrow();
  await f.authority.consumer.release(f.reserved.reservation);
  expect((await f.authority.consumer.inspect(f.scope)).state).toBe("pending");
  const reopened = createExecutionAdmissionAuthority({ persistence: f.store, scopes: f.scopes });
  const scope = await reopened.openScope(f.scopes.issue());
  expect((await reopened.consumer.inspect(scope)).state).toBe("pending");
  const root = new AdmissionTestSource(scope, "test.root");
  const ports = reopened.registerSource(root);
  const origin = root.origin();
  await expect(reopened.consumer.reserve(scope, ports.issuer.fromOrdinaryAdmission(root.admit(origin)))).rejects.toThrow();
}

const nativeRequest = { node: { id: "native", definitionId: "example.native" }, inputs: {} };
const effect = { type: "example.effect" };

describe("observed callback property reads", () => {
  it.each(["nativeNodeExecutor", "effectDispatcher", "now", "random"] as const)("refuses an inherited %s callback accessor during admission", async key => {
    const f = await automationObservationFixture();
    let reads = 0;
    let calls = 0;
    const prototype = {};
    Object.defineProperty(prototype, key, { get() {
      reads++;
      return () => { calls++; };
    } });
    Object.setPrototypeOf(f.options, prototype);
    await expect(enteredFrame(f.options, async () => { calls++; })).rejects.toThrow("callback_accessor_unsupported");
    expect(reads).toBe(0);
    expect(calls).toBe(0);
    await refusesAfterReopen(f);
  });

  it.each(["own", "inherited"] as const)("refuses a newly installed %s native getter without reading or dispatching it", async placement => {
    const f = await automationObservationFixture();
    let reads = 0;
    let acts = 0;
    let caught: unknown;
    await enteredFrame(f.options, async options => {
      const owner = placement === "own" ? options : {};
      Object.defineProperty(owner, "nativeNodeExecutor", { configurable: true, get() {
        reads++;
        return () => {
          acts++;
          return { result: { status: "success" } };
        };
      } });
      if (placement === "inherited") Object.setPrototypeOf(options, owner);
      try {
        await invokeAutomationNative(options, nativeRequest);
      } catch (error) {
        caught = error;
      }
    });
    expect(caught).toEqual(new Error("execution_observation.callback_accessor_unsupported"));
    expect(reads).toBe(0);
    expect(acts).toBe(0);
    await refusesAfterReopen(f);
  });

  it("refuses an effect callback getter replaced after admission even when its caller catches the error", async () => {
    const f = await automationObservationFixture();
    let reads = 0;
    let caught: unknown;
    await enteredFrame(f.options, async options => {
      Object.defineProperty(options, "effectDispatcher", { configurable: true, get() {
        reads++;
        return () => ({ status: "success" });
      } });
      try {
        await invokeAutomationEffect(options, effect, undefined, "attempt", 0);
      } catch (error) {
        caught = error;
      }
    });
    expect(caught).toEqual(new Error("execution_observation.callback_accessor_unsupported"));
    expect(reads).toBe(0);
    await refusesAfterReopen(f);
  });

  it.each(["own", "inherited"] as const)("guards the actual host capture adapter's %s callback getter", async placement => {
    const f = await automationObservationFixture();
    let reads = 0;
    let acts = 0;
    let caught: unknown;
    await enteredFrame(f.options, async options => {
      const owner = {};
      Object.defineProperty(owner, "captureStateSnapshot", { get() {
        reads++;
        return () => {
          acts++;
          return { kind: "unavailable", reason: "unsupported_node" };
        };
      } });
      const host = placement === "own" ? owner : Object.create(owner);
      options.hostRuntime = host;
      try {
        await captureHostState(options, { node: nativeRequest.node, attemptId: "attempt", inputs: {}, point: "before_action" }, automationStudioRunState(options));
      } catch (error) {
        caught = error;
      }
    });
    expect(caught).toEqual(new Error("execution_observation.callback_accessor_unsupported"));
    expect(reads).toBe(0);
    expect(acts).toBe(0);
    await refusesAfterReopen(f);
  });

  it("retains inherited data callbacks, their original receiver, tuple and first result", async () => {
    const f = await automationObservationFixture();
    const request = nativeRequest;
    const response = { result: { status: "success" as const } };
    let calls = 0;
    await enteredFrame(f.options, async options => {
      const prototype = { nativeNodeExecutor: function (this: AutomationStudioGraphExecutionOptions, received: typeof request) {
        calls++;
        expect(this).toBe(options);
        expect(received).toBe(request);
        expect(arguments.length).toBe(1);
        return response;
      } };
      Object.setPrototypeOf(options, prototype);
      expect(await invokeAutomationNative(options, request)).toBe(response);
    });
    expect(calls).toBe(1);
    await refusesAfterReopen(f);
  });

  it("keeps an unobserved accessor's original receiver, tuple and first result", async () => {
    let reads = 0;
    let calls = 0;
    const result = { result: { status: "success" as const } };
    const options: AutomationStudioGraphExecutionOptions = {};
    Object.defineProperty(options, "nativeNodeExecutor", { get() {
      reads++;
      return function (this: AutomationStudioGraphExecutionOptions, request: typeof nativeRequest) {
        calls++;
        expect(this).toBe(options);
        expect(request).toBe(nativeRequest);
        expect(arguments.length).toBe(1);
        return result;
      };
    } });
    expect(await invokeAutomationNative(options, nativeRequest)).toBe(result);
    expect(reads).toBe(1);
    expect(calls).toBe(1);
  });
});

describe("observed enumerable option copies", () => {
  it("keeps enumerable symbol data and ignores non-enumerable accessors in an observed copy", async () => {
    const f = await automationObservationFixture();
    const key = Symbol("data.option");
    let reads = 0;
    await enteredFrame(f.options, async options => {
      Object.defineProperty(options, key, { enumerable: true, value: "original" });
      Object.defineProperty(options, "unused", { get() {
        reads++;
        return "not copied";
      } });
      const changes: Partial<AutomationStudioGraphExecutionOptions> = {};
      Object.defineProperty(changes, key, { enumerable: true, value: "replacement" });
      const copied = copyAutomationExecutionOptions(options, changes);
      expect(Object.getOwnPropertyDescriptor(copied, key)?.value).toBe("replacement");
      expect(Object.hasOwn(copied, "unused")).toBe(false);
    });
    expect(reads).toBe(0);
    await f.rootPorts.producer.finish(f.reserved.root, f.root.complete(f.origin));
    await f.authority.consumer.release(f.reserved.reservation);
    expect((await f.authority.consumer.inspect(f.scope)).state).toBe("clear");
  });

  it.each(["source", "changes"] as const)("refuses an enumerable symbol getter on %s and fences the original frame", async placement => {
    const f = await automationObservationFixture();
    const key = Symbol("private.option");
    let reads = 0;
    let caught: unknown;
    await enteredFrame(f.options, async options => {
      const changes: Partial<AutomationStudioGraphExecutionOptions> = {};
      Object.defineProperty(placement === "source" ? options : changes, key, { enumerable: true, get() {
        reads++;
        return "must not be read";
      } });
      try {
        copyAutomationExecutionOptions(options, changes);
      } catch (error) {
        caught = error;
      }
    });
    expect(caught).toEqual(new Error("execution_observation.option_copy_accessor_unsupported"));
    expect(reads).toBe(0);
    await refusesAfterReopen(f);
  });

  it("copies enumerable symbol data and preserves legacy accessor copies", () => {
    const key = Symbol("legacy.option");
    const source: AutomationStudioGraphExecutionOptions = {};
    let reads = 0;
    Object.defineProperty(source, key, { enumerable: true, get() {
      reads++;
      return "original";
    } });
    const copied = copyAutomationExecutionOptions(source);
    expect(Object.getOwnPropertyDescriptor(copied, key)?.value).toBe("original");
    expect(reads).toBe(1);
  });
});

describe("observed live clock callbacks", () => {
  it("preserves a custom clock's original receiver and empty tuple", () => {
    const receiver = {};
    let received: unknown;
    const options: AutomationStudioGraphExecutionOptions = { now: function (this: unknown) {
      received = this;
      expect(arguments.length).toBe(0);
      return 17;
    } };
    expect(automationExecutionClock(options, "now", receiver)).toBe(17);
    expect(received).toBe(receiver);
  });

  it("guards the original live random wrapper in the real built-in node context after admission", async () => {
    const f = await automationObservationFixture();
    const descriptor = Object.getOwnPropertyDescriptor(Math, "random");
    if (!descriptor) throw new Error("test.native_clock_missing");
    let calls = 0;
    const replace = () => {
      Object.defineProperty(Math, "random", { configurable: true, value: () => {
        calls++;
        return 0.25;
      } });
      return undefined;
    };
    AutomationPureCallbacks.registerLexical(replace);
    f.options.resolveActionEffect = replace;
    f.options.random = automationStudioLiveRunEnvironment.random;
    let status: string | undefined;
    try {
      const trace = await runAutomationStudioGraph({ flowId: "guarded.random", nodes: [{ id: "random", definitionId: "builtin.random.number" }], edges: [] }, f.options);
      status = trace.status;
    } finally {
      Object.defineProperty(Math, "random", descriptor);
    }
    expect(status).toBe("failed");
    expect(calls).toBe(0);
    await refusesAfterReopen(f);
  });

  it.each(["now", "random"] as const)("refuses a replaced native delegate behind the original live %s wrapper", async operation => {
    const f = await automationObservationFixture();
    const container = operation === "now" ? Date : Math;
    const descriptor = Object.getOwnPropertyDescriptor(container, operation);
    if (!descriptor) throw new Error("test.native_clock_missing");
    let reads = 0;
    let caught: unknown;
    await enteredFrame(f.options, async options => {
      try {
        Object.defineProperty(container, operation, { configurable: true, get() {
          reads++;
          return () => 7;
        } });
        try {
          invokeAutomationCallbackSync(options, { receiver: undefined, callback: automationStudioLiveRunEnvironment[operation], args: [] });
        } catch (error) {
          caught = error;
        }
      } finally {
        Object.defineProperty(container, operation, descriptor);
      }
    });
    expect(caught).toEqual(new Error("native_clock.identity_unavailable"));
    expect(reads).toBe(0);
    await refusesAfterReopen(f);
  });
});
