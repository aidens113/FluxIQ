import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ notFound: vi.fn(() => { throw new Error("not-found"); }) }));
import { navItemsForPages } from "../../../../features/panel-shell/nav";
import { SETTINGS_TOOLS } from "../../../../features/settings-page/model";
import { ALWAYS_REACHABLE_PAGES, DEFAULT_PANEL_PRESET_ID, PANEL_PRESETS, currentPanelPreset, requirePanelScreen, requirePanelSettingsTool, resolvePanelPreset, settingsToolsForPreset } from "../index";

afterEach(() => { delete process.env.FLUXIQ_PANEL_PRESET; });

const navLabels = (id: string): string[] => navItemsForPages(resolvePanelPreset(id).pages).map((item) => item.label);

describe("each preset's nav", () => {
  it("full lists all six screens", () => {
    expect(navLabels("full")).toEqual(["Home", "Flows", "Runs", "Data", "Security", "Settings"]);
  });
  it("data-collection lists the screens that collect and show data", () => {
    expect(navLabels("data-collection")).toEqual(["Home", "Flows", "Runs", "Data", "Security", "Settings"]);
  });
  it("task-automation hides Data", () => {
    expect(navLabels("task-automation")).toEqual(["Home", "Flows", "Runs", "Security", "Settings"]);
  });
  it("every preset keeps Home, Security and Settings reachable and lists only real Settings tools", () => {
    for (const preset of Object.values(PANEL_PRESETS)) {
      for (const page of ALWAYS_REACHABLE_PAGES) expect(preset.pages).toContain(page);
      for (const id of preset.settingsTools) expect(SETTINGS_TOOLS.map((tool) => tool.id)).toContain(id);
      expect(PANEL_PRESETS[preset.id]).toBe(preset);
    }
  });
});

describe("the preset a deployment names", () => {
  it("is full when none is named", () => {
    expect(DEFAULT_PANEL_PRESET_ID).toBe("full");
    expect(currentPanelPreset().id).toBe("full");
    expect(resolvePanelPreset("  ").id).toBe("full");
  });
  it("is read from FLUXIQ_PANEL_PRESET", () => {
    process.env.FLUXIQ_PANEL_PRESET = "task-automation";
    expect(currentPanelPreset().id).toBe("task-automation");
  });
  it("is a clear error when unknown, naming the choices", () => {
    expect(() => resolvePanelPreset("nope")).toThrow('FLUXIQ_PANEL_PRESET "nope" is not a panel preset. Use one of: full, data-collection, task-automation.');
    expect(() => resolvePanelPreset("constructor")).toThrow("is not a panel preset");
    process.env.FLUXIQ_PANEL_PRESET = "nope";
    expect(() => currentPanelPreset()).toThrow("nope");
  });
});

describe("a hidden screen's route", () => {
  it("is refused as not found, and a shown one is served", () => {
    process.env.FLUXIQ_PANEL_PRESET = "task-automation";
    expect(() => requirePanelScreen("data")).toThrow("not-found");
    expect(() => requirePanelScreen("runs")).not.toThrow();
    expect(() => requirePanelScreen("settings")).not.toThrow();
    process.env.FLUXIQ_PANEL_PRESET = "full";
    expect(() => requirePanelScreen("data")).not.toThrow();
  });
  it("applies to Settings tools too", () => {
    process.env.FLUXIQ_PANEL_PRESET = "data-collection";
    expect(settingsToolsForPreset(currentPanelPreset()).map((tool) => tool.id)).toEqual(["docs", "runtime"]);
    expect(requirePanelSettingsTool("docs").id).toBe("docs");
    expect(() => requirePanelSettingsTool("compute-control")).toThrow("not-found");
    expect(() => requirePanelSettingsTool("secret-keys")).toThrow("not-found");
  });
});
