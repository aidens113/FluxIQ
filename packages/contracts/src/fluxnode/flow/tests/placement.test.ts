// Where Core files a new Flow: runtime, then site or app, then task.
import { describe, expect, it } from "vitest";
import { automaticFlowPath, flowPathSegmentFromText, isFlowPathSegment } from "../index.ts";

describe("automatic placement", () => {
  it("slugs free text into one segment", () => {
    expect(flowPathSegmentFromText("Send a reply!")).toBe("send-a-reply");
    expect(flowPathSegmentFromText("Market.Example:8080")).toBe("market.example-8080");
    expect(flowPathSegmentFromText("Café Crème")).toBe("cafe-creme");
    expect(flowPathSegmentFromText("...a..b...")).toBe("a.b");
    expect(flowPathSegmentFromText("!!!")).toBeNull();
    const long = flowPathSegmentFromText(`${"a".repeat(63)}-b`);
    expect(long).toBe("a".repeat(63));
    expect(isFlowPathSegment(long)).toBe(true);
  });

  it("files a Flow under runtime, place and task", () => {
    expect(automaticFlowPath({ runtime: "web", where: "market.example", task: "Cheapest listings" })).toEqual({ ok: true, value: "web/market.example/cheapest-listings" });
    expect(automaticFlowPath({ runtime: "android", where: "Messages", task: "Send reply" })).toEqual({ ok: true, value: "android/messages/send-reply" });
  });

  it("refuses a part with nothing to name a folder by", () => {
    expect(automaticFlowPath({ runtime: "web", where: "???", task: "x" })).toMatchObject({ ok: false, issues: [{ path: "/where", code: "flow_path.empty_segment" }] });
  });
});
