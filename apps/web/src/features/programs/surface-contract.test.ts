import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

describe("web surface hierarchy", () => {
  it("defines shell, pane, tool, selected, and code roles", () => {
    for (const role of ["--surface-shell", "--surface-pane", "--surface-tool", "--surface-selected", "--surface-code", "--content-code"]) {
      expect(css).toContain(`${role}:`);
    }
  });

  it("uses role aliases for Studio structure and technical content", () => {
    expect(css).toMatch(/\.automation-studio-shell\s*\{[^}]*background:\s*var\(--surface-shell\)/s);
    expect(css).toMatch(/\.automation-workspace-section\s*\{[^}]*background:\s*var\(--surface-pane\)/s);
    expect(css).not.toMatch(/background:\s*#(?:0f141a|0f1720|111827|101820|0f172a)/i);
  });
});