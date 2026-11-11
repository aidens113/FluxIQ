import { describe, expect, it } from "vitest";
import { readCssManifest } from "../css-manifest-test-helper";

const css = readCssManifest(new URL("../../../app/globals.css", import.meta.url));

describe("web geometry contract", () => {
  // Colour, elevation and the focus ring come from @fluxiq/ui-components' tokens.css (the
  // panel's one token system); the panel itself defines only layout values.
  it("defines the shared spacing, control and radius roles", () => {
    for (const token of ["--space-sm", "--control-height-default", "--radius-panel"]) {
      expect(css).toContain(`${token}:`);
    }
  });

  it("provides a visible baseline focus indicator", () => {
    expect(css).toContain(":where(a, button, input, select, textarea, [tabindex]):focus-visible");
    expect(css).toContain("outline: var(--focus-width) solid var(--focus)");
    expect(css).toContain("outline-offset: var(--focus-offset)");
  });
});