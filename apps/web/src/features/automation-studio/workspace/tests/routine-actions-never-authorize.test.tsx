import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  dirtyViewRegistrySnapshot,
  registerDirtyView,
  requestDirtyViewDecision,
  resetDirtyViewRegistryForTests
} from "../dirty-view-registry";
import { AutomationWorkspaceHeader } from "../shell/WorkspaceHeader";
import { AutomationWorkspacePreferences } from "../components/workspace-preferences";
import { defaultAutomationWorkspacePrefs } from "../layout/defaults";

afterEach(resetDirtyViewRegistryForTests);

const headerProps = {
  breadcrumbs: [],
  chrome: { setNarrowPanel: () => undefined } as never,
  commands: {
    closeProject: () => undefined,
    openDataInspector: () => undefined,
    openPreferences: () => undefined,
    openRuntime: () => undefined,
    requestWorkspaceSave: () => undefined
  } as never,
  inspectorLabel: "Inspector",
  narrow: false,
  narrowPanel: null
};

describe("routine work never asks for authorization", () => {
  it("saves the whole project from the header with no PIN dialog", () => {
    const html = renderToStaticMarkup(<AutomationWorkspaceHeader {...headerProps} />);
    expect(html).toContain("Save Project");
    expect(html).not.toContain("Security PIN");
    expect(html).not.toMatch(/type="password"/);
  });

  it("does not render a control that can never be enabled", () => {
    // The only registrar of runtime actions reports `canPause: false`
    // unconditionally, so a Pause button was dead in every state of the
    // product. With no run panel mounted the Play button says what it will
    // really do - open the run panel - rather than pretending it will start a
    // run and then quietly doing something else.
    const html = renderToStaticMarkup(<AutomationWorkspaceHeader {...headerProps} />);
    expect(html).not.toContain("Pause automation");
    expect(html).toContain('aria-label="Open the run panel"');
  });

  it("keeps the unsaved-changes guard free of a PIN and marks Discard as the destructive one", () => {
    // The guard renders through a portal, so it needs a document; the source is
    // the honest subject here, the way the other view contracts in this feature
    // are asserted.
    const source = readFileSync(new URL("../DirtyViewGuard.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("Security PIN");
    expect(source).not.toContain('type="password"');
    expect(source).not.toContain("authorizationPin");
    // Discard is the one button here that loses work, so it does not look like
    // the one that cancels, and it does not sit between Cancel and Save.
    expect(source).toMatch(/variant="danger">Discard changes</);
    expect(source).toContain('style={{ marginRight: "auto" }}');
    expect(source.indexOf("Discard changes")).toBeLessThan(source.indexOf(">Cancel<"));
  });

  it("still registers a pending decision the guard can show", () => {
    registerDirtyView({
      id: "settings",
      viewId: "flow-settings",
      label: "Flow Settings: Checkout",
      dirty: true,
      save: vi.fn(),
      discard: vi.fn()
    });
    expect(requestDirtyViewDecision({ actionLabel: "closing the project", proceed: vi.fn() })).toBe(false);
    expect(dirtyViewRegistrySnapshot().pending?.entries.map((entry) => entry.label)).toEqual(["Flow Settings: Checkout"]);
  });

  it("asks before throwing away the workspace layout", () => {
    const html = renderToStaticMarkup(<AutomationWorkspacePreferences
      prefs={defaultAutomationWorkspacePrefs()}
      saveStatus="Saved"
      setPrefs={() => undefined}
    />);
    expect(html).toContain("Reset workspace layout");
    expect(html).not.toContain("Reset it anyway");
    const source = AutomationWorkspacePreferences.toString();
    expect(source).toContain("resetArmed");
    expect(source).toContain("Reset it anyway");
    expect(source).toContain("Keep my layout");
  });
});
