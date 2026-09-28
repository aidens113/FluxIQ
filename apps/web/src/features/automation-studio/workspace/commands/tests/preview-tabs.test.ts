import { afterEach, describe, expect, it } from "vitest";
import { registerDirtyView, resetDirtyViewRegistryForTests } from "../../dirty-view-registry";
import { defaultAutomationWorkspacePrefs } from "../../layout/defaults";
import { createAutomationWorkspaceRenderStore } from "../../render-store";
import { createAutomationWorkspaceCommandPort } from "../port";
import { automationClosingTabLabel } from "../preview-tabs";
import { createAutomationWorkspaceCommands } from "../workspace-commands";
import {
  AUTOMATION_WARM_VIEW_CONSTRAINED_CAP,
  AUTOMATION_WARM_VIEW_DESKTOP_CAP
} from "../warm-activation";
import { automationStudioViewDefinitions } from "../../../views";

afterEach(resetDirtyViewRegistryForTests);

function workspace() {
  const store = createAutomationWorkspaceRenderStore(defaultAutomationWorkspacePrefs());
  const port = createAutomationWorkspaceCommandPort(store);
  return { commands: createAutomationWorkspaceCommands({ port }), store };
}

/** Three main-region views that are not the default tab, so each open is a real change. */
function mainViewIds(): [string, string, string] {
  const start = defaultAutomationWorkspacePrefs().panes[0]!.activeViewId;
  const ids = automationStudioViewDefinitions()
    .filter((definition) => definition.region === "main" && definition.id !== start)
    .map((definition) => definition.id);
  expect(ids.length).toBeGreaterThanOrEqual(3);
  return [ids[0]!, ids[1]!, ids[2]!];
}

describe("a preview tab previews", () => {
  it("replaces the pane's previous preview instead of appending another tab", () => {
    // Every click in the hierarchy tree opens a view in "preview" mode, and
    // that used to append. Browsing three Flows left three permanent tabs in a
    // strip that shows three or four, and the object-scoped views made it one
    // tab per Flow per view.
    const { commands, store } = workspace();
    const [first, second, third] = mainViewIds();
    const paneId = store.getPrefs().panes[0]!.id;
    const startingTabs = store.getPrefs().panes[0]!.tabs.length;

    commands.openView(first, "preview");
    commands.openView(second, "preview");
    commands.openView(third, "preview");

    const pane = store.getPrefs().panes.find((candidate) => candidate.id === paneId)!;
    expect(pane.tabs).toHaveLength(startingTabs + 1);
    expect(pane.tabs).toContain(third);
    expect(pane.tabs).not.toContain(first);
    expect(pane.tabs).not.toContain(second);
    expect(pane.activeViewId).toBe(third);
  });

  it("keeps a tab the person added from the palette, and previews beside it", () => {
    const { commands, store } = workspace();
    const [kept, previewed, next] = mainViewIds();
    const paneId = store.getPrefs().panes[0]!.id;

    commands.addPaneTab(paneId, kept);
    commands.openView(previewed, "preview");
    commands.openView(next, "preview");

    const pane = store.getPrefs().panes.find((candidate) => candidate.id === paneId)!;
    expect(pane.tabs).toContain(kept);
    expect(pane.tabs).toContain(next);
    expect(pane.tabs).not.toContain(previewed);
  });

  it("never drops a preview with unsaved work in it -- that tab is kept instead", () => {
    const { commands, store } = workspace();
    const [drafting, next] = mainViewIds();
    const paneId = store.getPrefs().panes[0]!.id;

    commands.openView(drafting, "preview");
    registerDirtyView({
      id: "draft-entry",
      viewId: drafting,
      label: "Draft",
      dirty: true,
      save: () => undefined,
      discard: () => undefined
    });
    commands.openView(next, "preview");

    const pane = store.getPrefs().panes.find((candidate) => candidate.id === paneId)!;
    expect(pane.tabs).toContain(drafting);
    expect(pane.tabs).toContain(next);
  });

  it("leaves the preview standing when the person only clicks its tab", () => {
    // Reading a tab is not deciding to keep it; that is what the palette is.
    const { commands, store } = workspace();
    const [previewed, other, next] = mainViewIds();
    const paneId = store.getPrefs().panes[0]!.id;

    commands.openView(previewed, "preview");
    commands.addPaneTab(paneId, other);
    commands.selectPaneTab(paneId, previewed);
    commands.openView(next, "preview");

    const pane = store.getPrefs().panes.find((candidate) => candidate.id === paneId)!;
    expect(pane.tabs).not.toContain(previewed);
    expect(pane.tabs).toContain(other);
  });
});

describe("what a close guard calls a tab", () => {
  it("names the view rather than printing its instance id", () => {
    // It read "closing flow-nodes::object::flow.checkout.subflow.primary.graph".
    const [viewId] = mainViewIds();
    const label = automationStudioViewDefinitions().find((definition) => definition.id === viewId)!.label;

    expect(automationClosingTabLabel(viewId)).toBe(`closing ${label}`);
    expect(automationClosingTabLabel(`${viewId}::object::flow.checkout.primary`)).toBe(`closing ${label}`);
    expect(automationClosingTabLabel(`${viewId}::object::flow.checkout.primary`)).not.toContain("::object::");
  });

  it("falls back to the id rather than refusing when nothing is registered under it", () => {
    expect(automationClosingTabLabel("not-a-view")).toBe("closing not-a-view");
  });
});

describe("how much a person can leave open and come back to", () => {
  it("keeps more inactive views mounted than a pane realistically holds", () => {
    // Everything a view holds in `useState` dies with its mount: the State
    // view's mode and selected evidence, the Problems filters, the Router's
    // in-progress route draft. At six and three, opening a fourth tab threw
    // away the first one's filters.
    expect(AUTOMATION_WARM_VIEW_DESKTOP_CAP).toBeGreaterThanOrEqual(12);
    expect(AUTOMATION_WARM_VIEW_CONSTRAINED_CAP).toBeGreaterThanOrEqual(6);
    expect(AUTOMATION_WARM_VIEW_CONSTRAINED_CAP).toBeLessThan(AUTOMATION_WARM_VIEW_DESKTOP_CAP);
  });
});
