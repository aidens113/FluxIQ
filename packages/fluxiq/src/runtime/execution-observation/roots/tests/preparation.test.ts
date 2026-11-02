import { expect, it } from "vitest";
import { createExecutionAdmissionAuthority, type ExecutionEntry, type ExecutionObservationContext } from "../../../execution-admission/index.ts";
import { AdmissionTestPersistence } from "../../../execution-admission/tests/persistence.ts";
import { AdmissionTestScopeOwner } from "../../../execution-admission/tests/scope-owner.ts";
import { ExecutionObservationSource } from "../../source.ts";
import { ExecutionCallbackRootSource } from "../index.ts";

it("pins the preparation owner's original private receiver through an actual configured root", async () => {
  const store = new AdmissionTestPersistence(), scopes = new AdmissionTestScopeOwner();
  const assembly = createExecutionAdmissionAuthority({ persistence: store, scopes });
  const scope = await assembly.openScope(scopes.issue());
  const callbacks = new ExecutionObservationSource(scope, "test.prepared.callback");
  const roots = new ExecutionCallbackRootSource(scope, assembly.consumer, callbacks, "test.prepared.root");
  roots.connect(assembly.registerSource(roots.registration([callbacks.owner])));
  callbacks.connect(assembly.registerSource(callbacks.registration([])));
  let entered!: () => void, resume!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const waiting = new Promise<void>(resolve => { resume = resolve; });
  class PreparationOwner {
    #calls = 0;
    get calls() { return this.#calls; }
    async prepared(context: ExecutionObservationContext, root: ExecutionEntry) {
      this.#calls++;
      const parent = assembly.entryBridge.read(root);
      expect(parent.sourceOwner).toBe(roots.owner);
      expect(assembly.entryBridge.read(context.parent).row.parentId).toBe(parent.row.entryId);
      entered();
      await waiting;
    }
  }
  const owner = new PreparationOwner(), result = {};
  const original = async () => result;
  callbacks.manage({ receiver: undefined, callback: original, contract: "no_direct_effects" });
  const pending = roots.invoke({ receiver: undefined, callback: original, args: [] }, undefined, owner);
  await Promise.race([started, pending.then(() => { throw new Error("test.callback_finished_before_preparation"); })]);
  owner.prepared = async () => { throw new Error("test.replaced_owner_method"); };
  resume();
  await expect(pending).resolves.toBe(result);
  expect(owner.calls).toBe(1);
  expect((await assembly.consumer.inspect(scope)).state).toBe("clear");
});
