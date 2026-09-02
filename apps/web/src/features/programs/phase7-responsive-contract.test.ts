import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readCssManifest } from "./css-manifest-test-helper";

const globalCss = readCssManifest(new URL("../../app/globals.css", import.meta.url));
const studioCss = readCssManifest(new URL("../../app/programs/automation-studio/automation-studio.css", import.meta.url));

describe("Phase 7 responsive certification contracts", () => {
  it("removes the known fixed tall-shell assumptions", () => {
    const owners = [
      "../automation-studio/styles/workspace/01-shell.css",
      "../automation-studio/styles/workspace/02-project-browser.css",
      "../automation-studio/styles/runtime/01-launch-history.css",
      "../automation-studio/styles/instructions-settings-adaptations-problems/01-instructions-settings.css",
      "../../app/styles/global-programs.css",
    ].map((specifier) => readFileSync(new URL(specifier, import.meta.url), "utf8"));
    for (const owner of owners) {
      expect(owner).not.toMatch(/min-height:\s*(?:520|620|680|700|720)px/u);
      expect(owner).not.toMatch(/minmax\((?:520|620|680|700|720)px/u);
    }
  });

  it("declares dynamic viewport and deliberate Studio scroll owners", () => {
    expect(studioCss).toContain("height: calc(100dvh - 49px)");
    expect(studioCss).toContain("These are the deliberate vertical scroll owners");
    expect(studioCss).toContain('.automation-mounted-view[data-active="true"]:not(.graph-body):not(.timeline-body)');
    expect(studioCss).toContain("scrollbar-gutter: stable");
    expect(studioCss).toContain(".automation-timeline-view:has(> .automation-timeline-toolbar)");
    expect(studioCss).toContain("grid-template-rows: auto auto minmax(360px, 1fr)");
    expect(studioCss).toMatch(/\.automation-timeline-overview\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*0;/su);
  });

  it("covers short height, tablet, 320px mobile, and 200-percent-equivalent reflow", () => {
    for (const css of [globalCss, studioCss]) {
      expect(css).toContain("@media (max-height: 600px)");
      expect(css).toContain("@media (max-width: 768px)");
      expect(css).toContain("@media (max-width: 390px)");
    }
    expect(globalCss).toContain("flex-direction: column");
    expect(studioCss).toContain("width: 100vw");
  });

  it("normalizes every shared control and state family", () => {
    for (const token of [
      ".field", ".segmented-control", ".icon-button", ".menu-popover", ".pagination",
      ".modal-panel", ".drawer-panel", ".data-table", ".status-badge-pill",
      ".empty-state", ".loading-state", ".inline-notice",
    ]) expect(globalCss, token).toContain(token);
  });
});
