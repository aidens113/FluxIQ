import { describe, expect, it } from "vitest";
import { PANEL_PAGES } from "../../../context";
import { PANEL_NAV_ITEMS, navItemForPath } from "../panel-nav-items";

describe("the places", () => {
  it("are Home, Projects, Flows, Runs, Data, Chats, Security and Settings, one per page", () => {
    expect(PANEL_NAV_ITEMS.map((item) => item.label)).toEqual(["Home", "Projects", "Flows", "Runs", "Data", "Chats", "Security", "Settings"]);
    expect(PANEL_NAV_ITEMS.map((item) => item.page)).toEqual([...PANEL_PAGES]);
  });

  it("say what each place holds now: keys are in Settings, not Security, and chats are one kind", () => {
    const hint = (page: string) => PANEL_NAV_ITEMS.find((item) => item.page === page)?.hint ?? "";
    expect(hint("security")).not.toMatch(/key/iu);
    expect(hint("settings")).toMatch(/AI keys/u);
    expect(hint("chats")).toBe("Every chat, in every project");
    expect(PANEL_NAV_ITEMS.map((item) => item.hint).join(" ")).not.toMatch(/assistant|conversation/iu);
  });

  it("find the item a path belongs to", () => {
    expect(navItemForPath("/")?.page).toBe("home");
    expect(navItemForPath("/flows")?.page).toBe("flows");
    expect(navItemForPath("/flows/flow.a")?.page).toBe("flows");
    expect(navItemForPath("/runs/run.1")?.page).toBe("runs");
    expect(navItemForPath("/projects")?.page).toBe("projects");
    expect(navItemForPath("/chats/c1?project=p")?.page).toBe("chats");
    expect(navItemForPath("/chats/c1")?.page).toBe("chats");
    expect(navItemForPath("/flowsandmore")).toBeUndefined();
    expect(navItemForPath("/programs/automation-studio")).toBeUndefined();
  });
});
