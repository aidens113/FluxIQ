import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

function mediaBlock(start: string, next?: string): string {
  const from = css.indexOf(start);
  const to = next ? css.indexOf(next, from + start.length) : css.length;
  return css.slice(from, to < 0 ? css.length : to);
}

describe("global responsive composition contract", () => {
  it("uses dynamic viewport ownership for pages and overlays", () => {
    expect(css).toContain("min-height: 100dvh");
    expect(css).toContain("max-height: calc(100dvh - (var(--space-md) * 2))");
    expect(css).toContain("max-height: 100dvh");
  });

  it("defines compact desktop, tablet, and narrow global compositions", () => {
    const compact = mediaBlock("@media (max-width: 1024px)", "@media (max-width: 768px)");
    const narrow = mediaBlock("@media (max-width: 390px)");
    expect(compact).toContain(".workspace-panel");
    expect(compact).toContain("grid-column: 1 / -1");
    expect(narrow).toContain(".modal-panel,");
    expect(narrow).toContain(".drawer-panel");
    expect(narrow).toContain("width: 100vw");
  });

  it("keeps constrained dialog actions reachable and touch-sized", () => {
    const tablet = mediaBlock("@media (max-width: 768px)", "@media (max-width: 390px)");
    const narrow = mediaBlock("@media (max-width: 390px)");
    expect(tablet).toContain("flex-wrap: wrap");
    expect(narrow).toContain(".modal-actions .button");
    expect(narrow).toContain("width: 100%");
  });
});