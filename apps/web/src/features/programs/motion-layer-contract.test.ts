import { describe, expect, it } from "vitest";
import { readCssManifest } from "./css-manifest-test-helper";

const css = readCssManifest(new URL("../../app/globals.css", import.meta.url));

describe("web motion and layer contract", () => {
  it("defines bounded semantic layers without extreme numeric stacks", () => {
    for (const layer of ["base", "raised", "sticky", "dropdown", "overlay", "modal", "toast", "critical"]) expect(css).toContain(`--layer-${layer}:`);
    const numericLayers = [...css.matchAll(/z-index:\s*(\d+)/g)].map((match) => Number(match[1]));
    expect(Math.max(0, ...numericLayers)).toBeLessThanOrEqual(130);
  });

  it("defines shared motion durations and a reduced-motion fallback", () => {
    expect(css).toContain("--motion-fast: 120ms");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("animation-duration: 0.01ms !important");
    expect(css).toContain("transition-duration: 0.01ms !important");
  });
});