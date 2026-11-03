import { expect } from "vitest";
import { createExecutionAdmissionAuthority } from "../../../runtime/execution-admission/index.ts";
import { AdmissionTestSource } from "../../../runtime/execution-admission/tests/source.ts";
import type { AutomationStudioGraphExecutionOptions } from "../contracts/index.ts";
import { automationObservationFixture } from "../execution-admission/tests/fixture.ts";
import { invokeAutomationFrame, prepareAutomationFrame, registerAutomationExecutionKernel } from "../execution-admission/kernel/index.ts";

/** Actual engine child entry, durable fake store and independent reopening. */
export async function enteredAutomationFrameFixture() {
  const f = await automationObservationFixture();
  return {
    ...f,
    async run<T>(work: (options: AutomationStudioGraphExecutionOptions) => Promise<T>): Promise<T> {
      const callback = async (options: AutomationStudioGraphExecutionOptions) => await work(options);
      const kernel = registerAutomationExecutionKernel(undefined, callback, "children");
      const frame = await prepareAutomationFrame(f.options, { receiver: undefined, callback }, kernel);
      if (!frame) throw new Error("Actual engine test frame missing.");
      const result = await invokeAutomationFrame(frame, { receiver: undefined, callback, args: [frame.options] });
      await f.engine.flush();
      return result;
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
