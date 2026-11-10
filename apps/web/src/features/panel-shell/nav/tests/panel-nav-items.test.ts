import { describe, expect, it } from "vitest";
import { PANEL_PAGES } from "../../context";
import { PANEL_NAV_ITEMS, navItemForPath } from "../panel-nav-items";

describe("the six places", () => {
  it("are Home, Flows, Runs, Data, Security and Settings, one per page", () => {
    expect(PANEL_NAV_ITEMS.map((item) => item.label)).toEqual(["Home", "Flows", "Runs", "Data", "Security", "Settings"]);
    expect(PANEL_NAV_ITEMS.map((item) => item.page)).toEqual([...PANEL_PAGES]);
  });

  it("find the item a path belongs to", () => {
    expect(navItemForPath("/")?.page).toBe("home");
    expect(navItemForPath("/flows")?.page).toBe("flows");
    expect(navItemForPath("/flows/flow.a")?.page).toBe("flows");
    expect(navItemForPath("/runs/run.1")?.page).toBe("runs");
    expect(navItemForPath("/flowsandmore")).toBeUndefined();
    expect(navItemForPath("/programs/automation-studio")).toBeUndefined();
  });
});
