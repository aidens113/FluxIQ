import { describe, expect, it } from "vitest";
import { getAutomationNodeDefinition } from "../../../nodes/index.ts";
import { automationStudioReadRuntimeRepeatObservation, automationStudioRuntimeRepeatDigest, automationStudioRuntimeRepeatExecutionKind } from "../index.ts";

describe("private observed-repeat evidence", () => {
  it("uses the existing strict canonical digest and declines unreadable or oversized JSON", () => {
    expect(automationStudioRuntimeRepeatDigest({ b: 2, a: [1, 3] })).toEqual(automationStudioRuntimeRepeatDigest({ a: [1, 3], b: 2 }));
    expect(automationStudioRuntimeRepeatDigest({ a: [3, 1] })).not.toEqual(automationStudioRuntimeRepeatDigest({ a: [1, 3] }));
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(automationStudioRuntimeRepeatDigest(cyclic)).toEqual({ kind: "unavailable", reason: "unreadable" });
    expect(automationStudioRuntimeRepeatDigest("x".repeat(1_048_577))).toEqual({ kind: "unavailable", reason: "unreadable" });
    let reads = 0;
    expect(automationStudioRuntimeRepeatDigest({ get value() {
      reads++;
      return "secret";
    } })).toEqual({ kind: "unavailable", reason: "unreadable" });
    expect(reads).toBe(0);
  });

  it("reads closed observation descriptors without invoking a getter or string coercion", () => {
    const valid = { kind: "observed", coverage: "complete", resource: "r", target: { kind: "none" }, viewDigest: "v" };
    expect(automationStudioReadRuntimeRepeatObservation(valid)).toEqual(valid);
    let reads = 0;
    expect(automationStudioReadRuntimeRepeatObservation({ ...valid, get viewDigest() {
      reads++;
      return "secret";
    } })).toEqual({ kind: "unavailable", reason: "unreadable" });
    expect(automationStudioReadRuntimeRepeatObservation({ kind: "unavailable", reason: { toString() {
      reads++;
      return "missing";
    } } })).toEqual({ kind: "unavailable", reason: "unreadable" });
    expect(reads).toBe(0);
    for (const malformed of [{ ...valid, coverage: "partial" }, { ...valid, extra: "hidden" }, { ...valid, target: { kind: "identified", key: "" } }, { ...valid, resource: "x".repeat(257) }]) expect(automationStudioReadRuntimeRepeatObservation(malformed)).toEqual({ kind: "unavailable", reason: "unreadable" });
  });

  it("requires actual canonical object and implementation identity for transparency", () => {
    const canonical = getAutomationNodeDefinition("builtin.data.constant")!;
    expect(automationStudioRuntimeRepeatExecutionKind(canonical)).toBe("transparent");
    expect(automationStudioRuntimeRepeatExecutionKind({ ...canonical })).toBe("barrier");
    const random = getAutomationNodeDefinition("builtin.random.number");
    expect(random).toBeDefined();
    expect(automationStudioRuntimeRepeatExecutionKind(random)).toBe("barrier");
    expect(automationStudioRuntimeRepeatExecutionKind(getAutomationNodeDefinition("builtin.timing.wait"))).toBe("barrier");
  });
});
