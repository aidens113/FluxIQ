import { describe, expect, it } from "vitest";
import { automationStudioToggleStateChoice, automationStudioToggleStateSignature } from "../index.ts";

const A = { state: "opaque.a" };
const B = { state: "opaque.b" };
const C = { state: "opaque.c" };
const AB = { beforeSignature: A, signature: B };
const BA = { beforeSignature: B, signature: A };

describe("an explicit observed end-state choice", () => {
  it("never chooses by first observation, majority, or observation order", () => {
    for (const explored of [[AB, BA, BA], [BA, AB, AB], [BA, BA, AB], [AB, ...Array(12).fill(BA)]]) {
      expect(automationStudioToggleStateChoice({ explored })).toMatchObject({ kind: "refused", code: "candidate.toggle_state_required" });
      for (const signature of [A, B]) expect(automationStudioToggleStateChoice({ parameters: { ensureState: signature }, explored })).toEqual({ kind: "selected", signature });
    }
  });

  it("allows the observed pre-state after just one transition, and preserves a selected state through reversals", () => {
    expect(automationStudioToggleStateChoice({ parameters: { ensureState: A }, explored: [AB] })).toEqual({ kind: "selected", signature: A });
    for (const explored of [[AB], [AB, BA], [AB, BA, AB, BA]]) {
      expect(automationStudioToggleStateChoice({ parameters: { ensureState: B }, explored })).toEqual({ kind: "selected", signature: B });
    }
  });

  it("accepts only the exact stored object, comparing JSON without depending on key order", () => {
    const stored = { opaque: { second: 2, first: 1 }, state: "a" };
    const choice = automationStudioToggleStateChoice({ parameters: { ensureState: { state: "a", opaque: { first: 1, second: 2 } } }, explored: [{ signature: stored }] });
    expect(choice).toEqual({ kind: "selected", signature: stored });
    if (choice.kind === "selected") {
      expect(choice.signature).not.toBe(stored);
      expect(Object.keys(choice.signature)).toEqual(Object.keys(stored));
    }
    for (const ensureState of [C, {}, [], null, "a", { ...stored, extra: true }, { state: "a" }, { state: "x".repeat(4_100) }]) {
      expect(automationStudioToggleStateChoice({ parameters: { ensureState }, explored: [{ signature: stored }] })).toMatchObject({ kind: "refused", code: "candidate.toggle_state_unobserved" });
    }
  });

  it("keeps legacy after-only observations readable without inventing an inverse", () => {
    expect(automationStudioToggleStateChoice({ explored: [{ signature: B }] })).toMatchObject({ kind: "refused", code: "candidate.toggle_state_required" });
    expect(automationStudioToggleStateChoice({ parameters: { ensureState: B }, explored: [{ signature: B }] })).toEqual({ kind: "selected", signature: B });
    expect(automationStudioToggleStateChoice({ parameters: { ensureState: A }, explored: [{ signature: B }] })).toMatchObject({ code: "candidate.toggle_state_unobserved" });
    expect(automationStudioToggleStateChoice({ parameters: { ensureState: A }, explored: [{ signature: B }, AB] })).toEqual({ kind: "selected", signature: A });
  });

  it("refuses incompatible complete pairs and a legacy state outside the known pair", () => {
    for (const explored of [[AB, { beforeSignature: A, signature: C }], [AB, { signature: C }], [AB, { beforeSignature: A, signature: A }]]) {
      for (const ensureState of [A, B, C]) expect(automationStudioToggleStateChoice({ parameters: { ensureState }, explored })).toMatchObject({ kind: "refused", code: "candidate.toggle_state_unresolved" });
    }
  });

  it("grounds the state actually shown separately from the result of a press", () => {
    const controls = [{ stateful: true as const, shown: A, ensures: B }];
    expect(automationStudioToggleStateChoice({ explored: [], controls })).toMatchObject({ code: "candidate.toggle_state_required" });
    for (const signature of [A, B]) expect(automationStudioToggleStateChoice({ parameters: { ensureState: signature }, explored: [], controls })).toEqual({ kind: "selected", signature });
    expect(automationStudioToggleStateChoice({ parameters: { ensureState: A }, explored: [BA], controls })).toEqual({ kind: "selected", signature: A });
    expect(automationStudioToggleStateChoice({ parameters: { ensureState: A }, explored: [], controls: [...controls, { stateful: true, shown: A, ensures: C }] })).toMatchObject({ code: "candidate.toggle_state_unresolved" });
  });

  it("refuses a stateful control with unreadable signatures, including after invalid optional evidence is dropped", () => {
    for (const control of [{ stateful: true as const }, { stateful: true as const, shown: {}, ensures: { state: "x".repeat(4_100) } }]) {
      expect(automationStudioToggleStateChoice({ parameters: { ensureState: A }, explored: [], controls: [control] })).toMatchObject({ code: "candidate.toggle_state_unresolved" });
    }
    expect(automationStudioToggleStateChoice({ parameters: { ensureState: A }, explored: [{ beforeSignature: {}, signature: B }] })).toMatchObject({ code: "candidate.toggle_state_unobserved" });
  });

  it("lets an unknown first press reveal states, but rejects an ungrounded written selection", () => {
    expect(automationStudioToggleStateChoice({ explored: [] })).toEqual({ kind: "unknown" });
    expect(automationStudioToggleStateChoice({ parameters: { ensureState: A }, explored: [] })).toMatchObject({ code: "candidate.toggle_state_unobserved" });
  });

  it("offers bounded observed signatures with truthful labels, never a correct-state claim", () => {
    const result = automationStudioToggleStateChoice({ explored: [AB, BA], controls: [{ stateful: true, shown: A, ensures: B }] });
    expect(result.kind).toBe("refused");
    if (result.kind !== "refused") return;
    expect(result.message).toContain(JSON.stringify(A));
    expect(result.message).toContain(JSON.stringify(B));
    expect(result.message).toContain("before press");
    expect(result.message).toContain("after press");
    expect(result.message).toContain("shown");
    expect(result.message).not.toMatch(/correct state|first state|majority/iu);
    expect(result.message.length).toBeLessThan(9_000);
  });
});

describe("a bounded opaque toggle signature", () => {
  it("copies plain JSON and drops malformed, cyclic, oversized and non-JSON evidence", () => {
    expect(automationStudioToggleStateSignature(A)).toEqual(A);
    expect(automationStudioToggleStateSignature(A)).not.toBe(A);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const invalid: unknown[] = [{}, [], new Date(), { state: undefined }, { state: Number.NaN }, { state: 1n }, cyclic, { state: "x".repeat(4_096) }];
    for (const value of invalid) expect(automationStudioToggleStateSignature(value)).toBeUndefined();
    expect(automationStudioToggleStateSignature({ state: "x".repeat(4_084) })).toEqual({ state: "x".repeat(4_084) });
    expect(automationStudioToggleStateSignature(Object.defineProperty({}, "state", { enumerable: true, get: () => { throw new Error("must not read accessors"); } }))).toBeUndefined();
  });
});
