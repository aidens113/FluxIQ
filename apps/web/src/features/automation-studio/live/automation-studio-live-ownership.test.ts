import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), "utf8");

const bootstrap = read("./AutomationStudioComposition.tsx");
const composition = read("./AutomationStudioSession.tsx");
const workspaceRuntime = read("./useAutomationWorkspaceRuntime.ts");
const navigation = read("./useAutomationSelectionNavigation.ts");
const deepLinks = read("./useAutomationDeepLinkRuntime.ts");
const graphRuntime = read("./useAutomationGraphRuntime.ts");
const projectRuntime = read("./useAutomationProjectRuntime.ts");
const hierarchyUi = read("./useAutomationHierarchyUiRuntime.ts");
const hierarchyBridge = read("./useAutomationHierarchyCommandBridge.ts");
const connectedViews = read("./view-host/canonical-connected-views.tsx");
const directConnector = read("./view-host/direct-view-connector.tsx");
const connectedEntryRegistry = read("./view-host/connected-view-entries.tsx");
const connectedRegions = read("./AutomationStudioConnectedRegions.tsx");
const workspaceComposition = read("./AutomationStudioWorkspaceComposition.tsx");
const gatewayBridge = read("./use-gateway-recording-bridge.ts");
const root = read("../AutomationStudioLive.tsx");

describe("Automation Studio extracted owner contracts", () => {
  it("keeps the public root declarative and free of runtime ownership", () => {
    expect(root).toContain("export { AutomationStudioComposition as AutomationStudioLive }");
    expect(root).not.toMatch(/useEffect|useState|useMemo|function AutomationStudioLive/u);
    expect(root.split(/\r?\n/u).length).toBeLessThan(50);
  });

  it("keeps the bootstrap free of project and presentation subscriptions", () => {
    expect(bootstrap).toContain("useAutomationStudioRuntime()");
    expect(bootstrap).toContain("<AutomationStudioSession");
    expect(bootstrap).not.toMatch(/useAutomationStoreSelector|useAutomationProjectView|useAutomationSelectionState/u);
  });

  it("keeps inline root selectors from invalidating external-store snapshots", () => {
    const selector = read("../stores/use-store-selector.ts");
    expect(selector).toContain("resolveAutomationStoreSelectorSnapshot(");
    expect(selector).not.toContain("cache.current = null");
  });

  it("guards workspace updates and pane activation from no-op click churn", () => {
    const commands = read("../workspace/commands/workspace-commands.ts");
    const persistence = read("../model/workspace-persistence.ts");
    expect(workspaceRuntime).toContain("if (candidate === current) return;");
    expect(workspaceRuntime).toContain("automationWorkspacePrefsSameRuntimeState(current, next)");
    expect(workspaceRuntime).toContain("options.workspaceRenderStore.replace(next)");
    expect(commands).toContain("const unchanged = current.activePaneId === paneId");
    expect(commands).toContain("if (unchanged) return false");
    expect(persistence).toContain("automationWorkspaceViewStatesSameRuntimeState(left.viewStates, right.viewStates)");
    expect(persistence).not.toContain("JSON.stringify(left.viewStates");
  });

  it("publishes gateway context only on project, focus, and visibility changes", () => {
    expect(gatewayBridge).toContain('window.addEventListener("focus", publishVisibleContext)');
    expect(gatewayBridge).toContain('document.addEventListener("visibilitychange", publishVisibleContext)');
    expect(gatewayBridge).not.toContain('addEventListener("pointerdown"');
    expect(gatewayBridge).not.toContain('addEventListener("keydown"');
  });

  it("uses known subflow graph IDs and leaves detail hydration to the active-view owner", () => {
    const loaders = read("../flow-editor/commands/loaders.ts");
    expect(hierarchyBridge).toContain("typeof node.metadata?.graphFlowId === \"string\"");
    expect(hierarchyBridge).toContain("node.metadata.graphFlowId : undefined");
    expect(navigation).toContain("resolveSubflowEditor(parentFlowId, subflowId, knownGraphFlowId)");
    expect(navigation).toContain('selectAndFollow({ kind: "flow", id: outcome.value.graphFlowId }, mode)');
    expect(navigation).not.toContain("loadFlowDetails(");
    expect(loaders).toContain("if (input.knownGraphFlowId)");
    expect(loaders).toContain('source: "known"');
    expect(connectedViews).toContain("onActive: (state, scope: AutomationCanonicalConnectorScope");
    expect(connectedViews).toContain("scope.loadFlowDetail");
  });

  it("keeps live tab and sidebar selection out of URL synchronization", () => {
    expect(projectRuntime).toContain("replaceAutomationStudioBrowserUrl(options.pathname");
    expect(projectRuntime).toContain("automationStudioDeepLinkParams({ projectId }, automationStudioCurrentSearchParams())");
    expect(projectRuntime).not.toContain("useRouter");
    expect(projectRuntime).not.toContain("router.replace");
    expect(deepLinks).toContain("const alreadyVisible = Boolean(");
    expect(deepLinks).not.toContain("replaceAutomationStudioBrowserUrl");
  });

  it("remembers active Flow identity separately from node selection", () => {
    expect(navigation).toContain('current.viewStates?.[automationStudioViewId.flowEditor]');
    expect(navigation).toContain("if (currentFlowState.lastOpenFlowId === next.id) return current;");
    expect(navigation).toContain('[automationStudioViewId.flowEditor]: { ...currentFlowState, lastOpenFlowId: next.id }');
    expect(deepLinks).toContain("options.selectedFlow?.flowId ?? options.lastOpenFlowId");
  });

  it("does not feed active tab focus into lazy preloading", () => {
    const start = composition.indexOf("useAutomationProjectPreload(api, {");
    const block = composition.slice(start, composition.indexOf("});", start));
    expect(start).toBeGreaterThan(-1);
    expect(block).toContain("openViewIds: openWorkspaceViewIdList");
    expect(block).not.toContain("activeViewId");
  });

  it("defers graph draft recovery reads behind the command boundary and idle scheduling", () => {
    const domainCommands = read("./domain-commands.ts");
    expect(graphRuntime).toContain("scheduleAutomationGraphIdleTask(() =>");
    expect(graphRuntime).toContain("options.liveCommands.loadRecoverableFlowDraft(flowId, baseGraph)");
    expect(graphRuntime).not.toContain("loadAutomationGraphDraft");
    expect(graphRuntime).not.toContain("loadAutomationGraphOperationDraft");
    expect(domainCommands).toContain("createBrowserAutomationFlowDraftRepository");
    expect(domainCommands).toContain("loadAutomationGraphOperationDraft");
  });

  it("validates graphs only while Problems is visible and on the idle lane", () => {
    expect(graphRuntime).toContain("const problemsVisible = options.workspacePrefs.panes.some");
    expect(graphRuntime).toContain("validate: problemsVisible");
    expect(graphRuntime).toContain("const subscribersActive = graphVisible || problemsVisible");
  });

  it("keeps development telemetry opt in", () => {
    const telemetry = read("../development/telemetry.ts");
    expect(telemetry).toContain("__FLUXIQ_ENABLE_AUTOMATION_STUDIO_TELEMETRY__ === true");
    expect(telemetry).toContain("if (!automationStudioDevelopmentTelemetryEnabled()) return;");
    expect(telemetry).toContain("if (!listenerUsers && !automationStudioDevelopmentTelemetryEnabled()) return;");
  });

  it("delegates project opening to lifecycle hydration without catalog refresh", () => {
    expect(projectRuntime).toContain("const lifecycle = useAutomationProjectLifecycle({");
    expect(projectRuntime).toContain("publishOpening(projectId)");
    expect(projectRuntime).toContain("projectDataPlatform.loadHydration(projectId, signal)");
    expect(projectRuntime).not.toContain("refreshProjects");
    expect(projectRuntime).not.toContain("async function openProject(");
  });

  it("keeps sidebar interaction and filtering in the hierarchy UI owner", () => {
    expect(hierarchyUi).toContain("treeRef.current = state;");
    expect(hierarchyUi).toContain("filterRef.current = filter;");
    expect(hierarchyUi.match(/scheduleSidebarWrite/g)).toHaveLength(2);
    expect(hierarchyUi).not.toContain("setWorkspacePrefs");
    expect(hierarchyUi).not.toContain("scheduleWorkspaceNavigation");
    const sidebar = read("../hierarchy/ProjectHierarchySidebar.tsx");
    expect(sidebar).toContain("const [filterState, setFilterState] = useState");
    expect(sidebar).toContain("props.onFilterStateChange(next)");
  });

  it("routes workspace preferences through the UI cache lane", () => {
    expect(workspaceRuntime).toContain("const shouldPersist = updateOptions.persist === true");
    expect(workspaceRuntime).toContain("options.uiCache.scheduleWorkspacePrefsWrite({");
    expect(workspaceRuntime).toContain("delayMs: commit.persist ? 200 : 80");
    expect(workspaceRuntime).toContain("if (!commit.persist) return;");
    expect(workspaceRuntime).toContain("options.workspaceRenderStore.markSaveRequested()");
    expect(workspaceRuntime).not.toContain("save-project-hierarchy");
  });

  it("preserves activated view instances while unopened views sleep", () => {
    const pane = read("../workspace/shell/PaneArea.tsx");
    const mounted = read("../workspace/shell/MountedViewStack.tsx");
    const viewSource = read("../workspace/shell/view-source.ts");
    expect(workspaceComposition).toContain("createAutomationWorkspaceViewSource(");
    expect(pane).toContain("useAutomationWorkspaceViews(props.source, props.pane.tabs, props.pane.activeViewId)");
    expect(mounted).toContain("const keepMounted = props.active || props.warm.isWarm(props.paneId, props.viewId)");
    expect(mounted).toContain("if (props.active) props.warm.markWarm(props.paneId, props.viewId)");
    expect(viewSource).toContain("useSyncExternalStore(subscribe, getSnapshot, getSnapshot)");
  });

  it("derives the workspace view source without an effect-driven store feedback loop", () => {
    expect(workspaceComposition).toContain("[props.views.entries]");
    expect(workspaceComposition).not.toContain("source.replace(");
    expect(workspaceComposition).not.toMatch(/useEffect\(\(\) => \{[\s\S]*props\.views\.entries/u);
  });

  it("wakes selected view bodies without a second Studio render", () => {
    const surface = read("./AutomationStudioWorkspaceSurface.tsx");
    const mounted = read("../workspace/shell/MountedViewStack.tsx");
    expect(composition).not.toContain("activeViewRenderSignature");
    expect(composition).not.toContain("readyActiveViewRenderSignature");
    expect(surface).toContain("const activeViewId = useAutomationWorkspaceSelector(props.store");
    expect(mounted).toContain("active={props.activePane && props.activeViewId === viewId}");
    expect(mounted).not.toMatch(/localActiveViewId|setLocalActiveViewId|warm\.subscribe/u);
    expect(mounted).not.toContain("scheduleWorkspaceNavigation");
  });

  it("keeps empty view switching out of hierarchy saves and requests", () => {
    const commands = read("../workspace/commands/workspace-commands.ts");
    expect(navigation).toContain("options.commands.openView(viewId, mode)");
    expect(navigation).not.toMatch(/save-project-hierarchy|runLatest\(|api\.post\(/u);
    expect(commands).toContain("if (unchanged) return false");
    expect(commands).toContain("tabs: uniqueTabs([...candidate.tabs, viewId])");
    expect(commands).not.toContain("warm.activate");
    expect(commands).not.toContain("port.schedule");
  });

  it("commits view navigation through the isolated synchronous render store", () => {
    const port = read("../workspace/commands/port.ts");
    const commands = read("../workspace/commands/workspace-commands.ts");
    expect(commands).toContain("port.commit(update");
    expect(port).toContain("store.replace(next)");
    expect(composition).toContain("useAutomationStudioFoundation(runtime)");
    expect(workspaceComposition).toContain("<AutomationStudioWorkspaceSurface");
    expect(workspaceComposition).toContain("source={source}");
    expect(workspaceComposition).toContain("store={props.workspace.store}");
    expect(navigation).toContain("runAutomationPresentationTransaction(() => {");
    expect(navigation).not.toContain("options.schedule");
    expect(navigation).not.toContain("loadFlowDetails(");
  });

  it("mounts project overlays outside the workspace surface", () => {
    expect(connectedRegions).toContain("<AutomationHierarchyDialog");
    expect(workspaceComposition).toContain("useAutomationStudioLiveOverlays({");
    expect(workspaceComposition.indexOf("<AutomationStudioWorkspaceSurface")).toBeLessThan(workspaceComposition.indexOf("<AutomationStudioOverlays"));
    expect(workspaceComposition).toContain("openPreferences: overlays.openPreferences");
    expect(workspaceComposition).toContain("openDataInspector: overlays.openDataInspector");
    expect(workspaceComposition).not.toMatch(/AutomationWorkspacePreferences|AutomationWindowAdderPalette|AutomationLayoutPicker/u);
  });

  it("contains loading and render failures inside independent shell regions", () => {
    const shell = read("../workspace/shell/WorkspaceShell.tsx");
    const boundary = read("../workspace/shell/RegionBoundary.tsx");
    for (const label of ["Header", "Hierarchy", "Editor", "Inspector", "Timeline"]) {
      expect(shell).toContain(`label="${label}"`);
    }
    expect(boundary).toContain("<Suspense fallback=");
    expect(boundary).toContain("getDerivedStateFromError");
    expect(boundary).toContain("previous.resetKey !== this.props.resetKey");
  });

  it("keeps pointer move resizing out of React state", () => {
    const regions = ["HierarchyRegion.tsx", "RightPaneArea.tsx", "TimelineDock.tsx"]
      .map((file) => read("../workspace/shell/" + file));
    const resize = read("../workspace/shell/resize-events.ts");
    for (const region of regions) {
      expect(region).toContain("beginAutomationSectionResize({");
      expect(region).toContain("transient:");
      expect(region).toContain("props.port.commit(");
    }
    expect(resize).toContain('window.addEventListener("pointermove", move)');
    expect(resize).toContain('window.addEventListener("pointercancel", cancel');
    expect([...regions, resize].join("\n")).not.toMatch(/useState|setLiveSidebarWidth|setLiveInspectorWidth|setLiveBottomTimelineHeight/u);
  });

  it("uses warm state only for mount retention", () => {
    const commands = read("../workspace/commands/workspace-commands.ts");
    const warm = read("../workspace/commands/warm-activation.ts");
    expect(commands).not.toContain("warm.activate");
    expect(warm).not.toContain("subscribe(");
    expect(warm).toContain("isWarm(paneId, viewId)");
    expect(warm).toContain("markWarm(paneId, viewId)");
    expect(warm).not.toContain("scheduleWorkspaceNavigation");
  });

  it("mounts typed selectors inside destination connectors instead of root publishers", () => {
    expect(connectedEntryRegistry).toContain("createAutomationDirectViewConnection(Connector");
    expect(composition).not.toMatch(/useAutomationCanonicalViewInputs|AutomationCanonicalViewPublishers/u);
    expect(directConnector).toContain("const active = props.activity.active");
    expect(directConnector).toContain("if (!active) return () => undefined;");
    expect(connectedViews).toContain("createAutomationDirectViewConnector({");
  });

  it("does not bootstrap through the unbounded legacy snapshot endpoint", () => {
    expect(composition).not.toContain('api.get("snapshot"');
    expect(composition).not.toContain('runLatest("studio-snapshot"');
    expect(projectRuntime).not.toContain('api.get("snapshot"');
  });

  it("opens created subflows without eager graph detail hydration", () => {
    const executor = read("../hierarchy/create-command-executor.ts");
    const start = executor.indexOf("async function createSubflow(");
    const block = executor.slice(start, executor.indexOf("async function createSubflowCategory(", start));
    expect(start).toBeGreaterThan(-1);
    expect(block).toContain("dependencies.openCreatedSubflow(");
    expect(block).not.toContain("loadHierarchyFlow(");
    expect(hierarchyBridge).toContain("openCreatedSubflow(flowId) { selectCreated(current, flowId); }");
    expect(hierarchyBridge).not.toContain("loadFlowDetails(");
    expect(connectedViews).toContain("scope.loadFlowDetail");
  });

  it("keeps feed reconciliation on exact cache resources without broad project invalidation", () => {
    const invalidation = read("../sync/project-invalidation.ts");
    expect(invalidation).toContain("invalidation.cacheResourceIds");
    expect(invalidation).toContain("emitAutomationStudioFeedReconciliationDiagnostic({");
    expect(invalidation).toContain("input.data.invalidate(input.projectId, invalidation.cacheScopes, invalidation.cacheResourceIds)");
    expect(invalidation).not.toContain("invalidateProject(");
    expect(invalidation).not.toContain('"root"');
  });
  it("keeps ordinary mutation notifications scoped to typed resource IDs", () => {
    const start = projectRuntime.indexOf("const notifyChanged = useCallback");
    const block = projectRuntime.slice(start, projectRuntime.indexOf("const refreshRuntime", start));
    expect(start).toBeGreaterThan(-1);
    expect(block).toContain("resourceIds: string[] = []");
    expect(block).toContain("projectDataPlatform.notifyMutation(scopes, [...new Set(resourceIds)])");
    expect(block).not.toContain('"root"');
    expect(composition).toContain('notifyProjectDataChanged(["recording", "timeline", "summary"], [recordingId])');
    expect(composition).not.toContain("program-api:mutation");
  });

  it("keeps broad project subscriptions out of Session and reads command snapshots on demand", () => {
    expect(composition).not.toMatch(/useAutomationProjectView|useAutomationCanonicalViewInputs|useAutomationProjectEntityCollection|useAutomationProjectDataResource/u);
    expect(composition).toContain("const current = getProjectView();");
    expect(composition).toContain("getSnapshot: () => {");
    expect(hierarchyBridge).toContain("current.indexes.hierarchyNodeById");
    expect(hierarchyBridge).toContain("current.indexes.canonicalFlowEntryById.get(flowId)");
  });

  it("uses stable empty resource identities in the Session projection", () => {
    const projectViewReader = read("./session-project-view.ts");
    expect(projectViewReader).toContain("EMPTY_AUTOMATION_PROJECT_ARTIFACTS");
    expect(projectViewReader).not.toMatch(/resource\([^\n]+, \{\}\)|resource\([^\n]+, \[\]\)/u);
    expect(composition).toContain('resource<any[]>("nativeNodeDefinitions", EMPTY_AUTOMATION_LIST)');
  });

  it("runs graph conversion only while a graph subscriber is mounted", () => {
    expect(graphRuntime).toContain("const subscribersActive = graphVisible || problemsVisible");
    expect(graphRuntime).toContain("if (!subscribersActive) return;");
    expect(graphRuntime).toContain("derivationJob.setRequest({");
    expect(graphRuntime).toContain("subscribersActive\n  ]");
  });
});
