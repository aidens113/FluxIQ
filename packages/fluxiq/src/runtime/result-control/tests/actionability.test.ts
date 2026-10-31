import { describe, expect, it } from "vitest";
import { projectRuntimeTargetActionability, readRuntimeTargetActionability } from "../index.ts";

describe("optional runtime target observations", () => {
  it("classifies absence, malformed/accessor metadata and reflection failures explicitly", () => {
    expect(readRuntimeTargetActionability({})).toEqual({ kind: "absent" });
    expect(readRuntimeTargetActionability({ actionability: { actionable: true, geometry: "PRIVATE" } })).toEqual({ kind: "rejected", reason: "invalid_record" });
    let reads = 0;
    const result = Object.defineProperty({ status: "failed" }, "actionability", {
      enumerable: true,
      get: () => {
        reads += 1;
        return { actionable: true };
      }
    });
    expect(readRuntimeTargetActionability(result)).toEqual({ kind: "rejected", reason: "accessor_metadata" });
    expect(projectRuntimeTargetActionability(result)).toEqual({ status: "failed" });
    expect(reads).toBe(0);
    const unreadable = new Proxy({ status: "failed", outputs: { actual: 1 }, actionability: { actionable: true } }, {
      getOwnPropertyDescriptor: (target, key) => {
        if (key === "actionability") throw new Error("unreadable metadata");
        return Reflect.getOwnPropertyDescriptor(target, key);
      }
    });
    expect(readRuntimeTargetActionability(unreadable)).toEqual({ kind: "unreadable", reason: "property_reflection_failed" });
    expect(projectRuntimeTargetActionability(unreadable)).toEqual({ status: "failed", outputs: { actual: 1 } });
  });

  it("copies valid controls without changing actual result fields, their descriptors or the original", () => {
    const actionability = Object.freeze({ actionable: false, cause: "covered" });
    const result = Object.freeze({ status: "failed", outputs: { actual: 2 }, actionability });
    const projected = projectRuntimeTargetActionability(result);
    expect(projected).toEqual(result);
    expect(projected).not.toBe(result);
    expect(projected.outputs).toBe(result.outputs);
    expect(projected.actionability).not.toBe(actionability);
    expect(Object.getOwnPropertyDescriptor(projected, "outputs")).toEqual(Object.getOwnPropertyDescriptor(result, "outputs"));
    expect(result.actionability).toBe(actionability);
  });
});
