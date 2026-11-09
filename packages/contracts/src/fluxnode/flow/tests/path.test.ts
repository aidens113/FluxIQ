// Flow paths: segments, limits and folders.
import { describe, expect, it } from "vitest";
import { flowPathFolder, flowPathSchema, isFlowPathSegment, joinFlowPath, parseFlowPath } from "../index.ts";

describe("Flow paths", () => {
  it("accepts slug segments joined by /", () => {
    expect(parseFlowPath("web/market.example/cheapest-listings")).toEqual({ ok: true, value: "web/market.example/cheapest-listings" });
    expect(parseFlowPath("android/messages/send_reply")).toEqual({ ok: true, value: "android/messages/send_reply" });
    expect(parseFlowPath("one")).toEqual({ ok: true, value: "one" });
  });

  it("refuses capitals, spaces, empty segments, .. and leading punctuation", () => {
    for (const bad of ["Web/x", "web/a b", "web//x", "/web", "web/", "web/../x", "web/a..b", "-web", "web.", ""]) {
      expect(parseFlowPath(bad).ok, bad).toBe(false);
    }
  });

  it("refuses more than 8 segments or a segment over 64 characters", () => {
    expect(parseFlowPath(Array.from({ length: 9 }, () => "a").join("/"))).toMatchObject({ ok: false, issues: [{ code: "flow_path.too_deep" }] });
    expect(isFlowPathSegment("a".repeat(64))).toBe(true);
    expect(isFlowPathSegment("a".repeat(65))).toBe(false);
  });

  it("joins segments and finds a folder", () => {
    expect(joinFlowPath(["web", "market.example", "x"])).toEqual({ ok: true, value: "web/market.example/x" });
    expect(joinFlowPath(["web", "Bad"]).ok).toBe(false);
    expect(flowPathFolder("web/market.example/x")).toBe("web/market.example");
    expect(flowPathFolder("x")).toBe("");
  });

  it("works as a zod schema", () => {
    expect(flowPathSchema.safeParse("a/b").success).toBe(true);
    expect(flowPathSchema.safeParse(3).success).toBe(false);
  });
});
