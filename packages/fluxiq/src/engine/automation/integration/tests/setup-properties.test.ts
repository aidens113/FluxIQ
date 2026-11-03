import { describe, expect, it } from "vitest";
import { automationStudioLiveRunEnvironment } from "../../../../runtime/environment/index.ts";
import { automationCallbackFromObservation } from "../../execution-admission/kernel/index.ts";
import { enteredAutomationFixture } from "../../execution-admission/tests/frame.ts";
import { automationObservationFixture } from "../../execution-admission/tests/fixture.ts";
import { createAutomationGraphOptions, type AutomationGraphOptionsInput, type AutomationNativeExecutionPort } from "../index.ts";

function input(observation?: AutomationGraphOptionsInput["executionObservation"]): AutomationGraphOptionsInput {
  return { signal: new AbortController().signal, authorizedDomainIds: [], ...(observation ? { executionObservation: observation } : {}) };
}

function native(): AutomationNativeExecutionPort {
  return { execute: async () => undefined, resolveActionEffect: () => ({ effectClass: "observe", permissionConsequences: [] }), resolveTargetRefresh: () => ({ kind: "absent", reason: "no_refresh_declaration" }), getRuntimeCapabilities: () => [] };
}

describe("observed graph option composition", () => {
  for (const key of ["execute", "resolveActionEffect", "resolveTargetRefresh", "getRuntimeCapabilities"] as const) {
    it.each(["own", "inherited"] as const)(`refuses a %s native ${key} getter before reading it`, async placement => {
      const f = await enteredAutomationFixture();
      let reads = 0;
      let acts = 0;
      await f.run(async (_options, observation) => {
        const original = native();
        const owner = placement === "own" ? original : {};
        delete (original as Partial<AutomationNativeExecutionPort>)[key];
        Object.defineProperty(owner, key, {
          get() {
            reads++;
            return () => {
              acts++;
            };
          },
        });
        if (placement === "inherited") Object.setPrototypeOf(original, owner);
        expect(() => createAutomationGraphOptions({ ...input(observation), nativeNodeRuntime: original })).toThrow("callback_accessor_unsupported");
      });
      expect(reads).toBe(0);
      expect(acts).toBe(0);
      await f.pending();
    });
  }

  it.each(["onRecordBatch", "environment"] as const)("refuses an input %s getter without invoking it", async key => {
    const f = await enteredAutomationFixture();
    let reads = 0;
    await f.run(async (_options, observation) => {
      const original = input(observation);
      Object.defineProperty(original, key, {
        get() {
          reads++;
          return () => undefined;
        },
      });
      expect(() => createAutomationGraphOptions(original)).toThrow("callback_accessor_unsupported");
    });
    expect(reads).toBe(0);
    await f.pending();
  });

  it.each(["now", "delay", "random", "startTimer"] as const)("refuses an offline environment %s getter before copying it", async key => {
    const f = await enteredAutomationFixture();
    let reads = 0;
    await f.run(async (_options, observation) => {
      const environment = { ...automationStudioLiveRunEnvironment, kind: "fixture" as const };
      Object.defineProperty(environment, key, {
        get() {
          reads++;
          return () => undefined;
        },
      });
      expect(() => createAutomationGraphOptions({ ...input(observation), environment })).toThrow("callback_accessor_unsupported");
    });
    expect(reads).toBe(0);
    await f.pending();
  });

  it("keeps a successful custom capabilities callback's private receiver and empty tuple without certifying it", async () => {
    const f = await enteredAutomationFixture();
    class Native {
      #calls = 0;
      getRuntimeCapabilities(...args: []) {
        expect(args).toEqual([]);
        this.#calls++;
        return ["native"];
      }
      get calls() { return this.#calls; }
    }
    const original = Object.assign(new Native(), native());
    // Retain the actual original private method rather than the object-literal fallback.
    original.getRuntimeCapabilities = Native.prototype.getRuntimeCapabilities;
    await f.run(async (_options, observation) => {
      expect(createAutomationGraphOptions({ ...input(observation), nativeNodeRuntime: original }).runtimeCapabilities).toEqual(["native"]);
    });
    expect(original.calls).toBe(1);
    await f.pending();
    expect(original.calls).toBe(1);
  });

  it("never retries a callback based on a thrown durable-frame error message", async () => {
    const f = await enteredAutomationFixture();
    const original = new Error("execution_observation.durable_frame_missing");
    let calls = 0;
    await f.run(async (_options, observation) => {
      const port = native();
      port.getRuntimeCapabilities = () => {
        calls++;
        throw original;
      };
      expect(() => createAutomationGraphOptions({ ...input(observation), nativeNodeRuntime: port })).toThrow(original);
    });
    expect(calls).toBe(1);
    await f.pending();
  });

  it("keeps the original pre-entry data-call API without claiming a durable callback frame", async () => {
    const f = await automationObservationFixture();
    let calls = 0;
    const port = native();
    port.getRuntimeCapabilities = () => {
      calls++;
      return ["native"];
    };
    expect(createAutomationGraphOptions({ ...input(f.observation), nativeNodeRuntime: port }).runtimeCapabilities).toEqual(["native"]);
    expect(calls).toBe(1);
    expect([...f.store.rows.values()].filter(row => row.row.sourceKey === "automation.engine")).toHaveLength(0);
  });

  it("refuses a dropped required original environment observation before work", () => {
    expect(() => automationCallbackFromObservation(undefined, true)).toThrow("required_environment_observation_missing");
    expect(automationCallbackFromObservation(undefined)).toBeUndefined();
  });
});
