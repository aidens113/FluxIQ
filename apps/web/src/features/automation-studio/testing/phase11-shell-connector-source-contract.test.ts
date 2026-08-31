import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const shellRegions = new Map([
  ["AutomationWorkspaceHeader", "../workspace/shell/WorkspaceHeader.tsx"],
  ["AutomationHierarchyRegion", "../workspace/shell/HierarchyRegion.tsx"],
  ["AutomationPaneArea", "../workspace/shell/PaneArea.tsx"],
  ["AutomationRightPaneArea", "../workspace/shell/RightPaneArea.tsx"],
  ["AutomationTimelineDock", "../workspace/shell/TimelineDock.tsx"],
]);

describe("Phase 11 shell and connector source contracts", () => {
  it("keeps every independently certified shell region behind a memo boundary", () => {
    for (const [component, relativePath] of shellRegions) {
      const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
      expect(source, component).toContain(`memo(function ${component}`);
    }
  });

  it("keeps hierarchy, editor, inspector, and timeline on narrow workspace selectors", () => {
    for (const relativePath of [...shellRegions.values()].slice(1)) {
      const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
      expect(source, relativePath).toContain("useAutomationWorkspaceSelector");
      expect(source, relativePath).not.toContain("useAutomationProjectView");
      expect(source, relativePath).not.toContain("useAutomationStoreSelector");
    }
  });

  it("wraps all five shell regions in project-local failure boundaries", () => {
    const source = readFileSync(new URL("../workspace/shell/WorkspaceShell.tsx", import.meta.url), "utf8");
    for (const label of ["Header", "Hierarchy", "Editor", "Inspector", "Timeline"]) {
      expect(source, label).toContain(`<AutomationRegionBoundary label="${label}"`);
    }
  });

  it("source contract: mounts direct destination connectors keyed by exact view ID", () => {
    const connector = readFileSync(new URL("../live/view-host/direct-view-connector.tsx", import.meta.url), "utf8");
    const entries = readFileSync(new URL("../live/view-host/connected-view-entries.tsx", import.meta.url), "utf8");
    const host = readFileSync(new URL("../views/ViewHost.tsx", import.meta.url), "utf8");
    const mounted = readFileSync(new URL("../workspace/shell/MountedViewStack.tsx", import.meta.url), "utf8");
    const source = readFileSync(new URL("../workspace/shell/view-source.ts", import.meta.url), "utf8");

    expect(entries).toContain("createAutomationDirectViewConnection");
    expect(entries).toContain("createAutomationConnectedViewHostRequest");
    expect(entries).not.toMatch(/createAutomationViewHostComposition|AutomationCanonicalViewPublishers/u);
    expect(host).toContain('if ("connect" in props.request) return props.request.connect(activity);');
    expect(connector).toContain("const active = props.activity.active");
    expect(connector).not.toMatch(/AutomationCanonicalViewPublisher|WorkspaceViewSource/u);
    expect(mounted).toContain("const AutomationMountedView = memo(function AutomationMountedView");
    expect(mounted).toContain("useAutomationWorkspaceView(props.source, props.viewId)");
    expect(source).toContain("source.subscribe(viewId, listener)");
  });

  it("source contract: hidden warm connectors retain models but create no domain or query subscriptions", () => {
    const connector = readFileSync(new URL("../live/view-host/direct-view-connector.tsx", import.meta.url), "utf8");
    const mounted = readFileSync(new URL("../workspace/shell/MountedViewStack.tsx", import.meta.url), "utf8");

    expect(connector.match(/if \(!active\) return \(\) => undefined;/gu)).toHaveLength(2);
    expect(connector).toContain("active && query ? store.subscribe(listener, scope) : () => undefined");
    expect(connector).toContain("if (!active) return retainedSelection.current.value;");
    expect(mounted).toContain("const keepMounted = props.active || props.warm.isWarm(props.paneId, props.viewId)");
    expect(mounted).toContain("active={props.active}");
    expect(mounted).toContain("keepMounted={keepMounted}");
  });

  it("source contract: Session and bootstrap do not subscribe to connector domain stores", () => {
    const composition = readFileSync(new URL("../live/AutomationStudioComposition.tsx", import.meta.url), "utf8");
    const session = readFileSync(new URL("../live/AutomationStudioSession.tsx", import.meta.url), "utf8");
    const runtimeHook = readFileSync(new URL("../bootstrap/useAutomationStudioRuntime.ts", import.meta.url), "utf8");

    expect(composition).toContain("const runtime = useAutomationStudioRuntime()");
    expect(composition).not.toMatch(/useSyncExternalStore|useAutomationProjectView|useAutomationStoreSelector/u);
    expect(runtimeHook).toContain("if (!runtimeRef.current) runtimeRef.current = createAutomationStudioRuntime()");
    expect(runtimeHook).not.toMatch(/useSyncExternalStore|subscribe\(/u);
    expect(session).toContain("useAutomationConnectedViewEntries");
    expect(session).not.toMatch(
      /useSyncExternalStore|useAutomationProjectEntityCollection|useAutomationProjectDataResource|useAutomationSelectionState/u,
    );
  });

  it("source contract: connector domain scopes are destination-local", () => {
    const connected = readFileSync(new URL("../live/view-host/canonical-connected-views.tsx", import.meta.url), "utf8");

    expect(connected).toContain('const recordingScopes = () => [\n  automationEntityScope("recordings"),');
    expect(connected).toContain('const runtimeScopes = () => [\n  automationEntityScope("flows"),');
    expect(connected).toContain('automationEntityScope("runs"),');
    expect(connected).toContain('const selectedFlowScopes = () => [\n  automationEntityScope("flows"),');
    expect(connected).not.toMatch(/AutomationCanonicalViewPublishers|createAutomationViewHostComposition/u);
  });
});
