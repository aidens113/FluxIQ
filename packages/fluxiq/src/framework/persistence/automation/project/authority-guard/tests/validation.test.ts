import { describe, expect, it } from "vitest";
import { AutomationStudioAuthorityGuardValidation as V } from "../index.ts";
const input = { protocolVersion: 1 as const, projectId: "original-project", ownerKind: "flow", ownerId: "original-flow", operationKind: "flow.save", requestDigest: `sha256:${"a".repeat(64)}`, expectedRevision: 0, operationKey: "original-operation" };
describe("closed guard inputs", () => {
  it("clones and freezes original IDs", () => { const found = V.legacy(input, input.projectId); expect(found).not.toBe(input); expect(Object.isFrozen(found)).toBe(true); expect(found.projectId).toBe(input.projectId); });
  it.each([{ ...input, extra: true }, { ...input, expectedRevision: -1 }, { ...input, ownerId: "" }, { ...input, protocolVersion: 2 }, { ...input, requestDigest: "not-a-digest" }, { ...input, operationKey: "x".repeat(161) }])("refuses changed/extra invalid envelopes", changed => { expect(() => V.legacy(changed as never, input.projectId)).toThrow(); });
  it("rejects getters without evaluating them, undefined, nonplain and sparse arrays", () => { let calls = 0; const accessor = { get value() { calls++; return 1; } }; expect(() => V.digest(accessor)).toThrow(); expect(calls).toBe(0); for (const value of [undefined, { a: undefined }, new Date(), new Array(2), [NaN]]) expect(() => V.digest(value)).toThrow(); });
  it("bounds depth, bytes and nodes and hashes arrays and objects canonically", () => { expect(V.digest({ b: [1, 2], a: true })).toBe(V.digest({ a: true, b: [1, 2] })); expect(() => V.digest("x".repeat(9000))).toThrow(); expect(() => V.digest(Array(1100).fill(1))).toThrow(); const cycle: Record<string, unknown> = {}; cycle.next = cycle; expect(() => V.digest(cycle)).toThrow(); });
});
