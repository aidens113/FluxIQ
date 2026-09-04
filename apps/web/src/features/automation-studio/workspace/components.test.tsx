import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { Blocks, Settings } from "lucide-react";
import { describe, expect, it } from "vitest";
import { AutomationViewContainer, automationActiveTabScrollLeft } from "./components/view-container";
import { AutomationWorkspacePreferences } from "./components/workspace-preferences";
import { defaultAutomationWorkspacePrefs } from "./layout/defaults";

describe("AutomationViewContainer tabs", () => {
  it("scrolls an active tab into the visible horizontal range", () => {
    expect(automationActiveTabScrollLeft({
      clientWidth: 300,
      scrollLeft: 100,
      tabLeft: 380,
      tabWidth: 80
    })).toBe(166);
    expect(automationActiveTabScrollLeft({
      clientWidth: 300,
      scrollLeft: 280,
      tabLeft: 100,
      tabWidth: 80
    })).toBe(94);
    expect(automationActiveTabScrollLeft({
      clientWidth: 300,
      scrollLeft: 100,
      tabLeft: 180,
      tabWidth: 80
    })).toBe(100);
  });

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
    expect(html.match(/class="automation-tab-item(?: selected)?"[^>]*role="tab"/g)).toHaveLength(2);
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain('data-tab-close="true" title="Close Nodes"');
    expect(html).toContain('aria-label="Scroll tabs left"');
    expect(html).toContain('aria-label="Find open tab"');
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain('aria-label="Window 1 tabs"');
    expect(html).toContain('aria-keyshortcuts="Alt+Shift+ArrowLeft Alt+Shift+ArrowRight Delete"');
    expect(html).toContain('aria-label="Close active tab"');
    expect(html).not.toContain("automation-window-resize-edge");
    expect(html).not.toContain("Reset window size");
    expect(html).toContain('aria-labelledby="automation-tab-main-nodes"');
    expect(html.match(/aria-controls="automation-panel-main"/g)).toHaveLength(2);
    expect(html).toContain('class="automation-view-body"');
  });

  it("commits tab selection immediately and renders the selected warm view in one pass", () => {
    const container = readFileSync(new URL("./components/view-container.tsx", import.meta.url), "utf8");
    const pane = readFileSync(new URL("./shell/PaneArea.tsx", import.meta.url), "utf8");
    const stack = readFileSync(new URL("./shell/MountedViewStack.tsx", import.meta.url), "utf8");

    expect(container).toContain("const selected = tab.id === props.activeViewId");
    expect(container).toContain("requestTabSelection(tab.id)");
    expect(container).toContain("props.onTabSelect(viewId)");
    expect(container).not.toContain('button.setAttribute("aria-selected"');
    expect(container).not.toContain('button.classList.toggle("selected"');
    expect(container).not.toContain("data-view-selection-pending");
    expect(container).not.toContain("pendingResetRef");
    expect(pane).not.toContain("props.port.schedule");
    expect(container).not.toContain("mounted-view-activation");
    expect(container).not.toMatch(/optimisticActiveViewId|pendingActiveViewId/u);
    expect(pane).toContain("props.commands.selectPaneTab(props.pane.id, viewId)");
    expect(pane).not.toContain("createAutomationMountedViewActivationStore");
    expect(stack).not.toContain("requestAnimationFrame");
    expect(stack).not.toContain("requestIdleCallback");
    expect(stack).not.toContain("cancelIdleCallback");
    expect(stack).not.toContain("startTransition");
    expect(stack).not.toContain("automation-view-activation-placeholder");
    expect(stack).toContain("active={props.activePane && props.activeViewId === viewId}");
    expect(stack).toContain("const keepMounted = props.active || props.warm.isWarm");
    expect(stack).not.toContain("pinned=");
    expect(stack).not.toContain("localActiveViewId");
    expect(stack).toContain("useSyncExternalStore(props.warm.subscribe");
    expect(stack).not.toContain("setActiveView");
  });

  it("keeps warm tab layouts contained while inactive", () => {
    const stack = readFileSync(new URL("./shell/MountedViewStack.tsx", import.meta.url), "utf8");
    const layout = readFileSync(new URL("../styles/workspace/04-layout.css", import.meta.url), "utf8");
    const css = readFileSync(new URL("../styles/workspace/04-layout.css", import.meta.url), "utf8");

    expect(css).not.toContain(".automation-view-keepalive");
    expect(stack).toContain('data-active={props.active ? "true" : "false"}');
    expect(layout).not.toContain("content-visibility:");
    expect(stack).not.toContain("inert={!props.active ? true : undefined}");
    expect(stack).toContain("aria-hidden={!props.active}");
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
    expect(css).toContain("grid-template-rows: minmax(38px, auto) minmax(36px, auto) minmax(0, 1fr)");
    expect(css).toMatch(/\.automation-view-container > header \{[^}]*min-height: 38px;[^}]*contain: layout paint style;/su);
  });

  it("does not attach pane activation to an already-active view body", () => {
    const source = readFileSync(new URL("./components/view-container.tsx", import.meta.url), "utf8");

    expect(source).toContain("onMouseDown={props.active ? undefined : props.onActivate}");
    expect(source).not.toContain("onMouseDown={props.onActivate}");
  });
});

describe("Automation hierarchy shell", () => {
  it("keeps the secondary toolbar focused on workspace actions", () => {
    const header = readFileSync(new URL("./shell/WorkspaceHeader.tsx", import.meta.url), "utf8");

    expect(header).toContain("Back to Projects");
    expect(header).toContain("Preferences");
    expect(header).not.toContain("Workspace location");
    expect(header).not.toContain("automation-workspace-breadcrumbs");
  });

  it("has one full-height resize owner and a contained three-row sidebar", () => {
    const hierarchy = readFileSync(new URL("../hierarchy/AutomationProjectHierarchySidebar.tsx", import.meta.url), "utf8");
    const region = readFileSync(new URL("./shell/HierarchyRegion.tsx", import.meta.url), "utf8");
    const shellCss = readFileSync(new URL("../styles/workspace/01-shell.css", import.meta.url), "utf8");
    const projectBrowserCss = readFileSync(new URL("../styles/workspace/02-project-browser.css", import.meta.url), "utf8");
    const layoutCss = readFileSync(new URL("../styles/workspace/04-layout.css", import.meta.url), "utf8");

    expect(hierarchy).not.toContain("automation-sidebar-resizer");
    expect(hierarchy).not.toContain("Resize project hierarchy");
    expect(region).toContain('className="automation-section-resize-handle hierarchy"');
    expect(region).toContain('aria-label="Resize hierarchy"');
    expect(shellCss).toContain("grid-template-rows: auto auto minmax(0, 1fr)");
    expect(shellCss).toContain(".automation-studio-sidebar-shell > .automation-studio-sidebar");
    expect(projectBrowserCss).toMatch(/\.sidebar-collapsed \.automation-studio-sidebar-heading \.inline-actions[\s\S]*?flex-direction: column/u);
    expect(shellCss).toMatch(/\.automation-studio-shell \{[^}]*contain: strict;/su);
    expect(shellCss).toContain("contain: size layout style");
    expect(layoutCss).toContain(".automation-section-resize-handle.hierarchy");
    expect(layoutCss).toContain("box-sizing: border-box");
    expect(layoutCss).toContain("padding: 0");
    expect(region).toContain('aria-controls="automation-project-hierarchy"');
    expect(layoutCss).toContain("outline: 2px solid var(--color-focus)");
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
