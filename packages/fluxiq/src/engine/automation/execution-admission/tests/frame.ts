import { expect } from "vitest";
import type { AutomationStudioGraphExecutionOptions } from "../../contracts/index.ts";
import { createExecutionAdmissionAuthority } from "../../../../runtime/execution-admission/index.ts";
import { AdmissionTestSource } from "../../../../runtime/execution-admission/tests/source.ts";
import { invokeAutomationFrame, prepareAutomationFrame, registerAutomationExecutionKernel } from "../kernel/index.ts";
import { automationObservationFixture } from "./fixture.ts";
import { AutomationObservationBindings } from "../bindings.ts";
import type { AutomationExecutionObservation } from "../index.ts";

export async function enteredAutomationFixture() {
  const f = await automationObservationFixture();
  return {
    ...f,
    async run(work: (options: AutomationStudioGraphExecutionOptions, observation: AutomationExecutionObservation) => Promise<void>): Promise<void> {
      const callback = async (options: AutomationStudioGraphExecutionOptions): Promise<void> => {
        const observation = AutomationObservationBindings.of(options);
        if (!observation) throw new Error("test.observed_binding_missing");
        await work(options, observation);
      };
      const identity = { receiver: undefined, callback };
      const kernel = registerAutomationExecutionKernel(undefined, callback, "children");
      const frame = await prepareAutomationFrame(f.options, identity, kernel);
      if (!frame) throw new Error("test.observed_frame_missing");
      await invokeAutomationFrame(frame, { ...identity, args: [frame.options] });
      try {
        await f.engine.flush();
      } catch (error) {
        if (error instanceof AggregateError) {
          for (const nested of error.errors) console.error("test.original_cleanup_cause", nested);
        }
        throw error;
      }
    },
    async pending(): Promise<void> {
      await expect(f.rootPorts.producer.finish(f.reserved.root, f.root.complete(f.origin))).rejects.toThrow();
      await f.authority.consumer.release(f.reserved.reservation);
      expect((await f.authority.consumer.inspect(f.scope)).state).toBe("pending");
      const authority = createExecutionAdmissionAuthority({ persistence: f.store, scopes: f.scopes });
      const scope = await authority.openScope(f.scopes.issue());
      expect((await authority.consumer.inspect(scope)).state).toBe("pending");
      const root = new AdmissionTestSource(scope, "test.root");
      const ports = authority.registerSource(root);
      const origin = root.origin();
      await expect(authority.consumer.reserve(scope, ports.issuer.fromOrdinaryAdmission(root.admit(origin)))).rejects.toThrow();
    }
  };
}
