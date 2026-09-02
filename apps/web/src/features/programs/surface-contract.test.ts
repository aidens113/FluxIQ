import { describe, expect, it } from "vitest";
import { readCssManifest } from "./css-manifest-test-helper";

const globalCss = readCssManifest(new URL("../../app/globals.css", import.meta.url));
const studioCss = readCssManifest(new URL("../../app/programs/automation-studio/automation-studio.css", import.meta.url));

describe("web surface hierarchy", () => {
  it("defines shell, pane, tool, selected, and code roles", () => {
    for (const role of ["--surface-shell", "--surface-pane", "--surface-tool", "--surface-selected", "--surface-code", "--content-code"]) {
      expect(globalCss).toContain(`${role}:`);
    }
  });

  it("uses role aliases for Studio structure and technical content", () => {
    expect(globalCss).not.toContain(".automation-studio-shell");
    expect(studioCss).toMatch(/\.automation-studio-shell\s*\{[^}]*background:\s*var\(--surface-shell\)/s);
    expect(studioCss).toMatch(/\.automation-workspace-section\s*\{[^}]*background:\s*var\(--surface-pane\)/s);
    expect(studioCss).not.toMatch(/background:\s*#(?:0f141a|0f1720|111827|101820|0f172a)/i);
  });
});
