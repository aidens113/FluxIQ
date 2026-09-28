import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function css(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("in-view layouts reflow against the pane, not the window", () => {
  it("makes the pane body a named query container", () => {
    expect(css("workspace/04-layout.css")).toContain("container: automation-pane / inline-size;");
  });

  it("asks about the pane width rather than the window width", () => {
    // The shell spends 280px on the sidebar and 320px on the details panel
    // before a view gets anything, and narrow mode only engages at 820px. So
    // between about 821px and 1100px the editor pane is 221-500px wide while a
    // `@media (max-width: 820px)` rule still answered "no" and left a 280px
    // column beside another one inside it.
    const responsive = css("workspace/10-responsive-certification.css");
    expect(responsive).toContain("@container automation-pane (max-width: 800px)");

    const paneKeyed = responsive.slice(responsive.indexOf("@container automation-pane (max-width: 800px)"));
    for (const layout of [
      ".automation-two-pane",
      ".automation-router-workbench",
      ".automation-subflow-directory-layout",
      ".automation-instructions-layout",
      ".automation-settings-layout",
      ".automation-runtime-layout",
      ".automation-run-detail-layout",
      ".automation-state-layout",
      ".automation-clients-layout",
      ".automation-problems-layout",
      ".automation-adaptations-layout"
    ]) {
      expect(paneKeyed, layout).toContain(layout);
    }

    // And they are no longer keyed on the window as well, or the conversion
    // would be an addition rather than a fix.
    const viewportKeyed = responsive.slice(
      responsive.indexOf("@media (max-width: 820px)"),
      responsive.indexOf("@container automation-pane (max-width: 800px)")
    );
    expect(viewportKeyed).not.toContain(".automation-two-pane");
    expect(viewportKeyed).not.toContain(".automation-instructions-layout");
  });
});

describe("the conversation launcher keeps off the bottom-right chrome", () => {
  it("reads its distance from the bottom edge rather than fixing it", () => {
    const dock = css("conversation/02-dock.css");
    expect(dock).toContain("bottom: var(--automation-conversation-dock-bottom, var(--space-lg));");
    expect(dock).toContain("bottom: var(--automation-conversation-dock-bottom, var(--space-sm));");
  });

  it("is raised above the step-preview dock, and above the sheet on a narrow screen", () => {
    // Both were anchored to the same corner: the collapsed step-preview dock is
    // a single header row whose own collapse control sits at its right-hand
    // end, and on a narrow screen the preview sheet is `bottom: 0; width: 100vw`.
    expect(css("workspace/04-layout.css")).toContain("body:has(.automation-studio-shell) {");
    expect(css("workspace/04-layout.css")).toContain("--automation-conversation-dock-bottom: calc(var(--space-lg) + 44px);");
    expect(css("workspace/06-responsive.css")).toContain("body:has(.drawer-panel.automation-preview-sheet) {");
  });
});
