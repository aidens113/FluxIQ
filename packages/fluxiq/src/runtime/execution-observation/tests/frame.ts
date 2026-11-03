import { expect } from "vitest";
import type { ExecutionCallbackObservation } from "../index.ts";
import { createExecutionAdmissionAuthority } from "../../execution-admission/index.ts";
import { AdmissionTestSource } from "../../execution-admission/tests/source.ts";
import { observationFixture } from "./fixture.ts";

/** Real original test source/frame and the same store reopened after a refusal. */
export async function enteredObservationFixture() {
  const f = await observationFixture();
  return {
    ...f,
    async run(work: (observation: ExecutionCallbackObservation) => Promise<void>): Promise<void> {
      const callback = async (): Promise<void> => await work(f.source.forParent(f.source.context(prepared)));
      f.source.manage({ receiver: undefined, callback, contract: "managed_direct_effects", consumeCompletion: ({ invocation }) => f.source.frameCompletion(invocation) });
      const call = { receiver: undefined, callback, args: [] as [] };
      const prepared = await f.source.prepare(f.observation, call);
      await f.source.invoke(prepared, call);
      await f.source.flush();
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
