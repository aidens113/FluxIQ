import { expect, it } from "vitest";
import { pinNativeExecutionCompletions, type NativeManagedCompletionRegistration } from "../index.ts";

it("pins the original callback and completion reader receiver before later registration edits", () => {
  const implementation = () => ({ status: "success" as const, outputs: {}, effects: [] });
  class Registration {
    #reads = 0;
    implementation = implementation;
    packageId = "test.original";
    packageVersion = "1";
    definitionId = "test.node";
    definitionVersion = "1";
    readonly contract = "managed_direct_effects" as const;
    consumeCompletion() {
      this.#reads++;
      return { disposition: "unknown" as const, code: "test.original_reader" };
    }
    reads() { return this.#reads; }
  }
  const original = new Registration();
  const declarations: NativeManagedCompletionRegistration[] = [original];
  const pinned = pinNativeExecutionCompletions(declarations);
  original.packageId = "test.replaced";
  original.implementation = () => ({ status: "success", outputs: {}, effects: [] });
  original.consumeCompletion = () => { throw new Error("test.replaced_reader_called"); };
  declarations.length = 0;
  expect(Object.isFrozen(pinned)).toBe(true);
  expect(Object.isFrozen(pinned[0])).toBe(true);
  expect(pinned[0]).toMatchObject({ packageId: "test.original", implementation });
  const declaration = pinned[0]!;
  if (declaration.contract !== "managed_direct_effects") throw new Error("test.contract_changed");
  expect(declaration.consumeCompletion({ invocation: {}, outcome: { kind: "fulfilled", value: implementation() } })).toEqual({ disposition: "unknown", code: "test.original_reader" });
  expect(original.reads()).toBe(1);
});
