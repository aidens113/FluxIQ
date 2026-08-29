import { describe, expect, it } from "vitest";
import { readCssManifest } from "./css-manifest-test-helper";

const css = readCssManifest(new URL("../../app/globals.css", import.meta.url));

describe("web geometry contract", () => {
  it("defines the shared spacing, control, radius, elevation, and focus roles", () => {
    for (const token of ["--space-sm", "--control-height-default", "--radius-panel", "--shadow-popover", "--focus-ring-width"]) {
      expect(css).toContain(`${token}:`);
    }
  });

  it("provides a visible baseline focus indicator", () => {
    expect(css).toContain(":where(a, button, input, select, textarea, [tabindex]):focus-visible");
    expect(css).toContain("outline: var(--focus-ring-width) solid var(--color-focus)");
  });
});