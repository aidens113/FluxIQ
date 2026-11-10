import { describe, expect, it } from "vitest";
import { pressGrantPayloadDigest } from "../digest.ts";

describe("press grant payload digest", () => {
  it("is the same for the same request in any key order, at any depth", () => {
    expect(pressGrantPayloadDigest({ a: 1, b: { c: [1, { d: 2, e: 3 }] } })).toBe(pressGrantPayloadDigest({ b: { c: [1, { e: 3, d: 2 }] }, a: 1 }));
  });

  it("differs for any change of value, array order or nesting", () => {
    const base = pressGrantPayloadDigest({ ids: ["a", "b"], deep: { flag: false } });
    expect(pressGrantPayloadDigest({ ids: ["b", "a"], deep: { flag: false } })).not.toBe(base);
    expect(pressGrantPayloadDigest({ ids: ["a", "b"], deep: { flag: true } })).not.toBe(base);
    expect(pressGrantPayloadDigest({ ids: ["a", "b"], deep: { flag: "false" } })).not.toBe(base);
    expect(pressGrantPayloadDigest({ ids: ["a", "b"], deep: { flag: false, more: 1 } })).not.toBe(base);
  });

  it("drops only the top-level carriers: the route's session and the grant", () => {
    expect(pressGrantPayloadDigest({ id: "x", authSessionId: "s", pressGrant: "g" })).toBe(pressGrantPayloadDigest({ id: "x" }));
    expect(pressGrantPayloadDigest({ id: "x", inner: { authSessionId: "s" } })).not.toBe(pressGrantPayloadDigest({ id: "x", inner: {} }));
  });

  it("reads a missing payload as an empty one, and an undefined field as absent, as JSON sends them", () => {
    expect(pressGrantPayloadDigest(undefined)).toBe(pressGrantPayloadDigest({}));
    expect(pressGrantPayloadDigest({ id: "x", note: undefined })).toBe(pressGrantPayloadDigest({ id: "x" }));
  });

  it("does not confuse a key holding a separator with two keys", () => {
    expect(pressGrantPayloadDigest({ 'a":1,"b': 2 })).not.toBe(pressGrantPayloadDigest({ a: 1, b: 2 }));
  });
});
