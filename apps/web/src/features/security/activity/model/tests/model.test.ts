import { describe, expect, it } from "vitest";
import { actionLabel, shapeActivityPage } from "..";

describe("actionLabel", () => {
  it("puts an action in words", () => {
    expect(actionLabel("iam:SetMemberRole")).toBe("Set member role");
    expect(actionLabel("iam:ListAuditEvents")).toBe("List audit events");
    expect(actionLabel("studio:ListRecordingSummaries")).toBe("List recording summaries");
    expect(actionLabel("ops:InspectFrameworkIo")).toBe("Inspect framework io");
  });

  it("shows anything else as it is", () => {
    expect(actionLabel("odd action")).toBe("odd action");
    expect(actionLabel("iam:")).toBe("iam:");
  });
});

describe("shapeActivityPage", () => {
  it("drops malformed entries and unknown fields, and reads an empty next as none", () => {
    const page = shapeActivityPage({ entries: [{ at: 1, who: "A", action: "x:Y", outcome: "denied", resources: [], extra: "dummy" }, { at: 1, who: "B", action: "x:Y", outcome: "maybe" }, null], next: "" });
    expect(page).toEqual({ entries: [{ at: 1, who: "A", action: "x:Y", outcome: "denied", resources: [] }], next: null });
    expect(shapeActivityPage(null)).toEqual({ entries: [], next: null });
  });
});
