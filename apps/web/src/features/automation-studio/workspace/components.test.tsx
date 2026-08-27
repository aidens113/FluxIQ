import { renderToStaticMarkup } from "react-dom/server";
import { Blocks, Settings } from "lucide-react";
import { describe, expect, it } from "vitest";
import { AutomationViewContainer, AutomationWorkspacePreferences } from "./components";
import { defaultAutomationWorkspacePrefs } from "./layout";

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
        { id: "settings", label: "Settings", type: "settings", icon: Settings },
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