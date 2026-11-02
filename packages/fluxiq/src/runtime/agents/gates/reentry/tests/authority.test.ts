import { describe, expect, it } from "vitest";
import { createGateReentryAuthority, type GateReentryBinding } from "../index.ts";

function fixture() {
  const scope = {};
  const gate = {};
  const proofs = new WeakMap<object, GateReentryBinding>();
  const authority = createGateReentryAuthority({ scope, readCompleted: proof => proofs.get(proof) ?? null });
  const binding: GateReentryBinding = { scope, gate, requestKey: "request.original", generation: "generation.actual", completedOrdinal: 1, remaining: 2 };
  const complete = (value = binding) => {
    const proof = Object.freeze({});
    proofs.set(proof, value);
    return proof;
  };
  return { scope, gate, authority, binding, complete };
}

describe("gate reentry authority", () => {
  it("consumes only the original permit once, without publishing a model-readable capability", () => {
    const f = fixture();
    const proof = f.complete();
    const permit = f.authority.issuer.issue(proof)!;
    expect(JSON.stringify(permit)).toBe("{}");
    expect(f.authority.consumer.consume({ ...permit }, f.binding)).toBe(false);
    expect(f.authority.consumer.consume(structuredClone(permit), f.binding)).toBe(false);
    expect(f.authority.consumer.consume(permit, f.binding)).toBe(true);
    expect(f.authority.consumer.consume(permit, f.binding)).toBe(false);
    expect(f.authority.issuer.issue(proof)).toBeUndefined();
    expect(f.authority.issuer.issue(f.complete())).toBeUndefined();
  });

  it.each(["scope", "gate", "requestKey", "generation", "completedOrdinal", "remaining"] as const)("rejects a changed %s without spending the matching permit", key => {
    const f = fixture();
    const permit = f.authority.issuer.issue(f.complete())!;
    const changed = { ...f.binding, [key]: typeof f.binding[key] === "object" ? {} : typeof f.binding[key] === "number" ? 99 : "different" };
    expect(f.authority.consumer.consume(permit, changed)).toBe(false);
    expect(f.authority.consumer.consume(permit, f.binding)).toBe(true);
  });

  it("rejects caller JSON and authentic completion from another scope", () => {
    const f = fixture();
    expect(f.authority.issuer.issue({ ...f.binding, resultReason: "retry_allowed" })).toBeUndefined();
    expect(f.authority.issuer.issue(f.complete({ ...f.binding, scope: {} }))).toBeUndefined();
    expect(f.authority.issuer.issue(f.complete({ ...f.binding, remaining: 0 }))).toBeUndefined();
  });

  it("revokes pending credit on entry and never reissues its completed ordinal", () => {
    const f = fixture();
    const permit = f.authority.issuer.issue(f.complete())!;
    f.authority.issuer.invalidate(f.gate);
    expect(f.authority.consumer.consume(permit, f.binding)).toBe(false);
    expect(f.authority.issuer.issue(f.complete())).toBeUndefined();
    const next = { ...f.binding, completedOrdinal: 2, remaining: 1 };
    const second = f.authority.issuer.issue(f.complete(next))!;
    expect(f.authority.consumer.consume(second, next)).toBe(true);
  });

  it("disposes the loop's rights without manufacturing completion or another scope", () => {
    const f = fixture();
    const permit = f.authority.issuer.issue(f.complete())!;
    f.authority.issuer.dispose();
    expect(f.authority.consumer.consume(permit, f.binding)).toBe(false);
    expect(f.authority.issuer.issue(f.complete({ ...f.binding, completedOrdinal: 2 }))).toBeUndefined();
  });
});
