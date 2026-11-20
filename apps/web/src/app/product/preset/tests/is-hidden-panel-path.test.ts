import { describe, expect, it } from "vitest";
import { SECURITY_TOOLS } from "../../../../features/settings-page/model";
import { OWN_SETTINGS_PAGES, isHiddenPanelPath } from "../is-hidden-panel-path";
import { PANEL_PRESETS } from "../panel-presets";

describe("isHiddenPanelPath", () => {
  const full = PANEL_PRESETS.full!;
  const tasks = PANEL_PRESETS["task-automation"]!;
  const data = PANEL_PRESETS["data-collection"]!;

  it("hides nothing on the full preset", () => {
    for (const path of ["/", "/projects", "/chats/c1", "/flows", "/runs/r1", "/data", "/security/keys", "/settings", "/settings/database-manager"]) expect(isHiddenPanelPath(path, full)).toBe(false);
  });

  it("hides a screen the preset leaves out, and everything under it", () => {
    expect(isHiddenPanelPath("/data", tasks)).toBe(true);
    expect(isHiddenPanelPath("/data/anything", tasks)).toBe(true);
    expect(isHiddenPanelPath("/database", tasks)).toBe(false);
    expect(isHiddenPanelPath("/runs", tasks)).toBe(false);
  });

  it("hides a Settings tool the preset does not list, never Settings itself", () => {
    expect(isHiddenPanelPath("/settings/database-manager", data)).toBe(true);
    expect(isHiddenPanelPath("/settings/docs", data)).toBe(false);
    expect(isHiddenPanelPath("/settings", data)).toBe(false);
  });

  it("lets the panel's own settings pages through on every preset, Saved logins included", () => {
    for (const preset of Object.values(PANEL_PRESETS)) {
      expect(isHiddenPanelPath("/settings/saved-logins", preset)).toBe(false);
      expect(isHiddenPanelPath("/settings/saved-logins/anything", preset)).toBe(false);
    }
    expect(isHiddenPanelPath("/settings/saved-loginsx", data)).toBe(true);
  });

  it("never hides the always-reachable screens or API routes", () => {
    for (const preset of Object.values(PANEL_PRESETS)) {
      for (const path of ["/", "/security", "/security/sign-in", "/settings", "/api/runs", "/welcome"]) expect(isHiddenPanelPath(path, preset)).toBe(false);
    }
  });
});

describe("the panel's own settings pages", () => {
  it("are exactly the Settings page's own tools under /settings/", () => {
    const own = SECURITY_TOOLS.filter((tool) => tool.href.startsWith("/settings/")).map((tool) => tool.href);
    expect([...OWN_SETTINGS_PAGES].sort()).toEqual([...own].sort());
  });
});
