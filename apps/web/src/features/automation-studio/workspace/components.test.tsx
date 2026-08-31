import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { Blocks, Settings } from "lucide-react";
import { describe, expect, it } from "vitest";
import { AutomationViewContainer } from "./components/view-container";
import { AutomationWorkspacePreferences } from "./components/workspace-preferences";
import { defaultAutomationWorkspacePrefs } from "./layout/defaults";

describe("AutomationViewContainer tabs", () => {
  it("renders an accessible overflow-safe tab strip and linked panel", () => {
    const html = renderToStaticMarkup(<AutomationViewContainer
      active
      activeViewId="nodes"
      icon={Blocks}
      onActivate={() => undefined}
      onAddTab={() => undefined}
      onClose={() => undefined}
      onCloseTab={() => undefined}
      onMoveTab={() => undefined}
      onTabSelect={() => undefined}
      subtitle="Flow editor"
      tabs={[
        { id: "nodes", label: "Nodes", type: "design", icon: Blocks },
        { id: "settings", label: "Settings", type: "settings", icon: Settings }
      ]}
      title="Checkout"
      windowId="main"
      windowIndex={0}
    ><div>Editor</div></AutomationViewContainer>);

    expect(html).toContain('role="tablist"');
    expect(html).toContain('role="tab"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain('aria-label="Close Nodes"');
    expect(html).toContain('aria-label="Scroll tabs left"');
    expect(html).toContain('aria-label="Find open tab"');
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain('aria-label="Window 1 tabs"');
    expect(html).toContain('aria-keyshortcuts="Alt+Shift+ArrowLeft Alt+Shift+ArrowRight"');
    expect(html).toContain('aria-label="Close active tab"');
    expect(html).not.toContain("automation-window-resize-edge");
    expect(html).not.toContain("Reset window size");
    expect(html).toContain('aria-labelledby="automation-tab-main-nodes"');
    expect(html).toContain('class="automation-view-body"');
  });

  it("uses workspace props as the sole active-view owner", () => {
    const container = readFileSync(new URL("./components/view-container.tsx", import.meta.url), "utf8");
    const pane = readFileSync(new URL("./shell/PaneArea.tsx", import.meta.url), "utf8");
    const stack = readFileSync(new URL("./shell/MountedViewStack.tsx", import.meta.url), "utf8");

    expect(container).toContain("const selected = tab.id === props.activeViewId");
    expect(container).toContain("props.onTabSelect(tab.id)");
    expect(container).not.toContain("mounted-view-activation");
    expect(container).not.toContain("optimisticActiveViewId");
    expect(pane).toContain("props.commands.selectPaneTab(props.pane.id, viewId)");
    expect(pane).not.toContain("createAutomationMountedViewActivationStore");
    expect(stack).toContain("active={props.activePane && props.activeViewId === viewId}");
    expect(stack).not.toContain("localActiveViewId");
    expect(stack).not.toContain("warm.subscribe");
  });

  it("keeps warm tab layouts contained while inactive", () => {
    const stack = readFileSync(new URL("./shell/MountedViewStack.tsx", import.meta.url), "utf8");
    const css = readFileSync(new URL("../styles/workspace/04-layout.css", import.meta.url), "utf8");

    expect(css).not.toContain(".automation-view-keepalive");
    expect(stack).toContain('data-active={props.active ? "true" : "false"}');
    expect(stack).not.toContain("inert={!props.active}");
    expect(stack).not.toMatch(/\n\s+hidden=\{!props\.active\}/u);
    expect(css).toContain(".automation-mounted-view[data-active=");
    expect(css).toContain("contain: strict");
    expect(css).not.toContain("visibility: hidden");
    expect(css).toContain("opacity: 0");
  });

  it("keeps the shared body geometry stable and view classes destination-local", () => {
    const source = readFileSync(new URL("./components/view-container.tsx", import.meta.url), "utf8");
    const stack = readFileSync(new URL("./shell/MountedViewStack.tsx", import.meta.url), "utf8");
    const css = readFileSync(new URL("../styles/workspace/04-layout.css", import.meta.url), "utf8");

    expect(source).not.toContain("bodyClassName");
    expect(stack).toContain('entry.bodyClassName ?? ""');
    expect(source).toContain('behavior: "auto"');
    expect(source).not.toContain('behavior: "smooth"');
    expect(css).not.toContain(".automation-view-body.graph-body");
    expect(css).toMatch(/\.automation-view-body \{[^}]*display: grid;[^}]*overflow: hidden;/su);
    expect(css).not.toContain(".automation-view-body:has");
    expect(css).not.toContain("scroll-behavior: smooth");
  });

  it("does not attach pane activation to an already-active view body", () => {
    const source = readFileSync(new URL("./components/view-container.tsx", import.meta.url), "utf8");

    expect(source).toContain("onMouseDown={props.active ? undefined : props.onActivate}");
    expect(source).not.toContain("onMouseDown={props.onActivate}");
  });
});

describe("Automation hierarchy shell", () => {
  it("has one full-height resize owner and a contained three-row sidebar", () => {
    const hierarchy = readFileSync(new URL("../hierarchy/AutomationProjectHierarchySidebar.tsx", import.meta.url), "utf8");
    const region = readFileSync(new URL("./shell/HierarchyRegion.tsx", import.meta.url), "utf8");
    const shellCss = readFileSync(new URL("../styles/workspace/01-shell.css", import.meta.url), "utf8");
    const layoutCss = readFileSync(new URL("../styles/workspace/04-layout.css", import.meta.url), "utf8");

    expect(hierarchy).not.toContain("automation-sidebar-resizer");
    expect(hierarchy).not.toContain("Resize project hierarchy");
    expect(region).toContain('className="automation-section-resize-handle hierarchy"');
    expect(region).toContain('aria-label="Resize hierarchy"');
    expect(shellCss).toContain("grid-template-rows: auto auto minmax(0, 1fr)");
    expect(shellCss).toContain(".automation-studio-sidebar-shell > .automation-studio-sidebar");
    expect(shellCss).toMatch(/\.automation-studio-shell \{[^}]*contain: layout paint style;/su);
    expect(shellCss).toContain("contain: size layout style");
    expect(layoutCss).toContain(".automation-section-resize-handle.hierarchy");
    expect(layoutCss).toContain("box-sizing: border-box");
    expect(layoutCss).toContain("padding: 0");
  });
});

describe("AutomationWorkspacePreferences", () => {
  it("renders complete grouped controls, save state, and an explicit reset command", () => {
    const html = renderToStaticMarkup(
      <AutomationWorkspacePreferences
        prefs={{ ...defaultAutomationWorkspacePrefs(), density: "compact", motion: "reduce" }}
        saveStatus="All workspace changes saved"
        setPrefs={() => undefined}
      />
    );

    expect(html).toContain("Hierarchy width");
    expect(html).toContain("Inspector width");
    expect(html).toContain("Dock height");
    expect(html).toContain("Density");
    expect(html).toContain("Compact operations");
    expect(html).toContain("Motion");
    expect(html).toContain("Reduce motion");
    expect(html).toContain("All workspace changes saved");
    expect(html).toContain("Reset workspace layout");
  });
});
