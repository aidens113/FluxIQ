import { describe, expect, it } from "vitest";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";
import { automationCollapseToggleIcon, automationCollapseToggleLabel } from "../CollapseToggle";

describe("one collapse control for one verb", () => {
  it("points the chevron the way the panel is about to move", () => {
    expect(automationCollapseToggleIcon(false, "left")).toBe(ChevronLeft);
    expect(automationCollapseToggleIcon(true, "left")).toBe(ChevronRight);
    expect(automationCollapseToggleIcon(false, "right")).toBe(ChevronRight);
    expect(automationCollapseToggleIcon(true, "right")).toBe(ChevronLeft);
    expect(automationCollapseToggleIcon(false, "bottom")).toBe(ChevronDown);
    expect(automationCollapseToggleIcon(true, "bottom")).toBe(ChevronUp);
  });

  it("says show and hide, in those words, whichever region is asking", () => {
    expect(automationCollapseToggleLabel(false, "sidebar")).toBe("Hide the sidebar");
    expect(automationCollapseToggleLabel(true, "details panel")).toBe("Show the details panel");
  });
});
