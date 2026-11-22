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
  it.each(["latest_date", "LatestDate", "_leading", "a".repeat(65), "constructor", "prototype", "__proto__"])("fills own exact identifier %s and never inherited data", (name) => {
    const inputs = Object.fromEntries([[name, "current"]]);
    const before = Object.getPrototypeOf(inputs);
    expect(fillFluxNodeGoal(`Use {${name}}.`, inputs)).toEqual({ ok: true, value: "Use current." });
    expect(fillFluxNodeGoal(`Use {${name}}.`, {})).toMatchObject({ ok: false, issues: [{ code: "goal.missing_input" }] });
    expect(Object.keys(inputs)).toEqual([name]);
    expect(Object.getPrototypeOf(inputs)).toBe(before);
  });
  it("fills text as written and other values as canonical JSON", () => {
    expect(fillFluxNodeGoal("Find {count} {query} in {where}.", { count: 3, query: "lens hood", where: { b: 1, a: "x" } })).toEqual({ ok: true, value: 'Find 3 lens hood in {"a":"x","b":1}.' });
  });

  it("names every missing input", () => {
    expect(fillFluxNodeGoal("{a} {b}", {})).toMatchObject({ ok: false, issues: [{ path: "/inputs/a", code: "goal.missing_input" }, { path: "/inputs/b" }] });
  });
});
