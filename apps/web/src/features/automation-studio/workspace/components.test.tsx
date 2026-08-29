import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { Blocks, Settings } from "lucide-react";
import { describe, expect, it } from "vitest";
import { createAutomationMountedViewActivationStore } from "./components/mounted-view-activation";
import { AutomationViewContainer } from "./components/view-container";
import { AutomationWorkspacePreferences } from "./components/workspace-preferences";
import { defaultAutomationWorkspacePrefs } from "./layout/defaults";

describe("AutomationViewContainer tabs", () => {
  it("renders an accessible overflow-safe tab strip and linked panel", () => {
    const html = renderToStaticMarkup(<AutomationViewContainer
      activation={createAutomationMountedViewActivationStore()}
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
      bodyClassName="graph-body"
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
    expect(html).toContain('class="automation-view-body graph-body"');
  });

  it("keeps active tab feedback in the typed mounted-view store", () => {
    const container = readFileSync(new URL("./components/view-container.tsx", import.meta.url), "utf8");
    const activation = readFileSync(new URL("./components/mounted-view-activation.ts", import.meta.url), "utf8");
    const pane = readFileSync(new URL("./shell/PaneArea.tsx", import.meta.url), "utf8");
    const stack = readFileSync(new URL("./shell/MountedViewStack.tsx", import.meta.url), "utf8");

    expect(container).toContain("useAutomationMountedViewActivation(props.activation, props.windowId)");
    expect(container).toContain("activateAutomationMountedView(props.activation, props.windowId, viewId)");
    expect(container).toContain("const selected = tab.id === optimisticActiveViewId");
    expect(container).toContain("selectTab(tab.id)");
    expect(activation).toContain("createAutomationMountedViewActivationStore");
    expect(activation).toContain("return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)");
    expect(activation).not.toContain("CustomEvent");
    expect(activation).not.toContain("window.dispatchEvent");
    expect(pane).toContain("props.commands.selectPaneTab(props.pane.id, viewId)");
    expect(stack).toContain("const activePane = activation.activeWindow ?? props.activePane");
  });

  it("does not keep hidden heavy tab views mounted", () => {
    const css = readFileSync(new URL("../styles/workspace/04-layout.css", import.meta.url), "utf8");

    expect(css).not.toContain(".automation-view-keepalive");
  });

  it("uses explicit body classes and instant tab scrolling", () => {
    const source = readFileSync(new URL("./components/view-container.tsx", import.meta.url), "utf8");
    const css = readFileSync(new URL("../styles/workspace/04-layout.css", import.meta.url), "utf8");

    expect(source).toContain("bodyClassName?: string");
    expect(source).toContain('behavior: "auto"');
    expect(source).not.toContain('behavior: "smooth"');
    expect(css).toContain(".automation-view-body.graph-body");
    expect(css).not.toContain(".automation-view-body:has");
    expect(css).not.toContain("scroll-behavior: smooth");
  });

  it("does not attach pane activation to an already-active view body", () => {
    const source = readFileSync(new URL("./components/view-container.tsx", import.meta.url), "utf8");

    expect(source).toContain("onMouseDown={optimisticWindowActive ? undefined : props.onActivate}");
    expect(source).not.toContain("onMouseDown={props.onActivate}");
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
