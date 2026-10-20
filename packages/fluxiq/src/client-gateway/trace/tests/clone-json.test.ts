import { describe, expect, it } from "vitest";
import { cloneClientGatewayTraceJson } from "../index.ts";

describe("cloneClientGatewayTraceJson", () => {
  it("copies plain JSON deep-frozen, keeping key order, null, empties and unknown fields", () => {
    const source = { b: 1, a: null, list: [{ x: "" }], empty: {}, none: [] };
    const copy = cloneClientGatewayTraceJson(source);
    expect(copy).toEqual(source);
    expect(Object.keys(copy as object)).toEqual(["b", "a", "list", "empty", "none"]);
    expect(Object.isFrozen(copy)).toBe(true);
    expect(Object.isFrozen((copy as { list: object[] }).list[0])).toBe(true);
    source.list[0]!.x = "changed";
    expect(copy).toEqual({ b: 1, a: null, list: [{ x: "" }], empty: {}, none: [] });
  });

  it("leaves out an undefined property, as the wire does", () => {
    expect(cloneClientGatewayTraceJson({ kept: 1, dropped: undefined })).toEqual({ kept: 1 });
  });

  it("keeps a __proto__ key as data", () => {
    const copy = cloneClientGatewayTraceJson(JSON.parse('{"__proto__":{"polluted":true}}')) as Record<string, unknown>;
    expect(Object.keys(copy)).toEqual(["__proto__"]);
    expect(Object.getPrototypeOf(copy)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("refuses, with the path, anything the wire would silently change", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.again = cyclic;
    expect(() => cloneClientGatewayTraceJson({ a: { b: Number.NaN } })).toThrow('"/a/b" is a non-finite number');
    expect(() => cloneClientGatewayTraceJson({ when: new Date(0) })).toThrow('"/when" is not a plain object');
    expect(() => cloneClientGatewayTraceJson({ map: new Map() })).toThrow("not a plain object");
    expect(() => cloneClientGatewayTraceJson({ run: () => 1 })).toThrow("is a function");
    expect(() => cloneClientGatewayTraceJson({ big: 1n })).toThrow("is a bigint");
    expect(() => cloneClientGatewayTraceJson([1, undefined])).toThrow('"/1" is a hole or undefined');
    expect(() => cloneClientGatewayTraceJson(cyclic)).toThrow('"/again" is a cycle');
    expect(() => cloneClientGatewayTraceJson(undefined)).toThrow("undefined");
  });

  it("allows the same object twice when it is not a cycle", () => {
    const shared = { v: 1 };
    expect(cloneClientGatewayTraceJson({ a: shared, b: shared })).toEqual({ a: { v: 1 }, b: { v: 1 } });
  });
});
