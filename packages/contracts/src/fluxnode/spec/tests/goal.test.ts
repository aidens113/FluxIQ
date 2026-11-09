// Goal placeholders: reading them and filling them from inputs.
import { describe, expect, it } from "vitest";
import { fillFluxNodeGoal, readFluxNodeGoal } from "../index.ts";

describe("readFluxNodeGoal", () => {
  it("splits text and placeholders, listing each input once", () => {
    expect(readFluxNodeGoal("Find {count} {query}, then {count} more.")).toEqual({
      ok: true,
      parts: [{ text: "Find " }, { input: "count" }, { text: " " }, { input: "query" }, { text: ", then " }, { input: "count" }, { text: " more." }],
      inputs: ["count", "query"]
    });
  });

  it("reads doubled braces as literal braces", () => {
    expect(readFluxNodeGoal("Use {{x}} literally")).toEqual({ ok: true, parts: [{ text: "Use {x} literally" }], inputs: [] });
  });

  it("refuses a brace that is neither a placeholder nor doubled", () => {
    for (const goal of ["a { b", "a {1x} b", "a } b", "a {} b", "a {x y} b"]) expect(readFluxNodeGoal(goal).ok, goal).toBe(false);
  });
});

describe("fillFluxNodeGoal", () => {
  it("fills text as written and other values as canonical JSON", () => {
    expect(fillFluxNodeGoal("Find {count} {query} in {where}.", { count: 3, query: "lens hood", where: { b: 1, a: "x" } })).toEqual({ ok: true, value: 'Find 3 lens hood in {"a":"x","b":1}.' });
  });

  it("names every missing input", () => {
    expect(fillFluxNodeGoal("{a} {b}", {})).toMatchObject({ ok: false, issues: [{ path: "/inputs/a", code: "goal.missing_input" }, { path: "/inputs/b" }] });
  });
});
