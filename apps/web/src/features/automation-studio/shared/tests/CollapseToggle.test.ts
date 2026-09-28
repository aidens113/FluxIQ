import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";
import { automationCollapseToggleIcon, automationCollapseToggleLabel } from "../CollapseToggle";

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

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

  it("is the only collapse chevron the panel draws", () => {
    // Four regions wrote their own: "Collapse sidebar", "Collapse right area",
    // "Collapse timeline", "Collapse the conversation", with three different
    // icon pairs and three different classes for one verb.
    const regions = [
      "../../workspace/shell/RightPaneArea.tsx",
      "../../workspace/shell/TimelineDock.tsx",
      "../../hierarchy/AutomationProjectHierarchySidebar.tsx",
      "../../conversation/components/ConversationDock.tsx"
    ];
    for (const path of regions) {
      const region = source(path);
      expect(region, path).toContain("<AutomationCollapseToggle");
      expect(region, path).not.toMatch(/Chevron(?:Up|Down|Left|Right)/u);
    }
  });
});
