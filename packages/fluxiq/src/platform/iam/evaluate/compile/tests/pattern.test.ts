// Wildcard patterns on their own: anchoring, escaping, and variable binding.
import { describe, expect, it } from "vitest";
import { compileIamPattern } from "../pattern.ts";

const bindings = { "${fluxiq:PrincipalId}": "a.b", "${fluxiq:WorkspaceId}": null };

describe("compileIamPattern", () => {
  it("treats * as any run and ? as one character", () => {
    const pattern = compileIamPattern("a*b?c", null, false);
    expect(pattern?.test("abxc")).toBe(true);
    expect(pattern?.test("a:/x/b-c")).toBe(true);
    expect(pattern?.test("abc")).toBe(false);
  });

  it("escapes every regular-expression character", () => {
    const text = "x^$.+()[]{}|\\/-y";
    expect(compileIamPattern(text, null, false)?.test(text)).toBe(true);
    expect(compileIamPattern("a.c", null, false)?.test("abc")).toBe(false);
  });

  it("binds variables literally and refuses an unbound or unknown one", () => {
    expect(compileIamPattern("user/${fluxiq:PrincipalId}", bindings, false)?.test("user/a.b")).toBe(true);
    expect(compileIamPattern("user/${fluxiq:PrincipalId}", bindings, false)?.test("user/axb")).toBe(false);
    expect(compileIamPattern("${fluxiq:WorkspaceId}:*", bindings, false)).toBeNull();
    expect(compileIamPattern("${fluxiq:Other}", bindings, false)).toBeNull();
  });

  it("compares case-insensitively only when asked", () => {
    expect(compileIamPattern("studio:read*", null, true)?.test("studio:ReadProject")).toBe(true);
    expect(compileIamPattern("studio:read*", null, false)?.test("studio:ReadProject")).toBe(false);
  });
});
