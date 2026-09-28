import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  automationActiveTabScrollLeft,
  automationHiddenTabCount,
  automationHiddenTabLabel
} from "../view-container";

describe("the tab strip says how much it is not showing", () => {
  it("counts every tab that is wholly or partly off either end", () => {
    // The strip is 28px | tabs | count | 28px | 28px with a hidden scrollbar, so
    // at a 900px window the pane is about 300px and two tabs fit. Nothing said
    // so: a pane showing two of fifteen looked like a pane with two tabs.
    const tabs = [
      { left: 0, width: 120 },
      { left: 124, width: 120 },
      { left: 248, width: 120 },
      { left: 372, width: 120 }
    ];

    expect(automationHiddenTabCount({ clientWidth: 300, scrollLeft: 0, tabs })).toBe(2);
    expect(automationHiddenTabCount({ clientWidth: 300, scrollLeft: 248, tabs })).toBe(2);
    expect(automationHiddenTabCount({ clientWidth: 600, scrollLeft: 0, tabs })).toBe(0);
    expect(automationHiddenTabCount({ clientWidth: 300, scrollLeft: 0, tabs: [] })).toBe(0);
  });

  it("says it in words a screen reader can read out", () => {
    expect(automationHiddenTabLabel(1)).toBe("1 more tab is open - show all open tabs");
    expect(automationHiddenTabLabel(4)).toBe("4 more tabs are open - show all open tabs");
  });
});

describe("the strip keeps where the person scrolled it", () => {
  it("does not re-run its scroll on mere pane activation", () => {
    // The effect was keyed on `props.active`, so focus moving between panes --
    // which changes nothing about which tab is selected -- threw away a
    // deliberate horizontal scroll of the strip.
    const source = readFileSync(new URL("../view-container.tsx", import.meta.url), "utf8");
    expect(source).toContain("}, [props.activeViewId, tabOrderKey]);");
    expect(source).not.toContain("}, [props.active, props.activeViewId, tabOrderKey]);");
  });

  it("still brings the selected tab back into view when the selection moves", () => {
    expect(automationActiveTabScrollLeft({ clientWidth: 300, scrollLeft: 0, tabLeft: 372, tabWidth: 120 })).toBe(198);
    expect(automationActiveTabScrollLeft({ clientWidth: 300, scrollLeft: 248, tabLeft: 0, tabWidth: 120 })).toBe(0);
    expect(automationActiveTabScrollLeft({ clientWidth: 600, scrollLeft: 0, tabLeft: 124, tabWidth: 120 })).toBe(0);
  });
});
