import { useEffect, useState } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createAutomationStudioStores } from "../../../stores";
import { createAutomationWorkspaceRenderStore } from "../../../workspace/render-store";
import { createAutomationStudioUiStore } from "../../../workspace/studio-ui-store";
import { defaultAutomationWorkspacePrefs } from "../../../workspace/layout";
import { automationStudioViewId } from "../../../views";
const state = vi.hoisted(() => ({ query: "", foundation: null as any, createFlow: vi.fn(), openView: vi.fn(), openProject: vi.fn(), deepLink: vi.fn(), mounts: vi.fn(), unmounts: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/programs/automation-studio", useSearchParams: () => new URLSearchParams(state.query) }));
vi.mock("../../hooks", async (importOriginal) => {
  const { useAutomationBrowserEntry } = await importOriginal<typeof import("../../hooks")>();
  const noop = () => undefined;
  return {
    useAutomationBrowserEntry,
    useAutomationStudioFoundation: () => state.foundation,
    useAutomationWorkspaceRuntime: () => ({ commands: {}, port: {}, replacePrefs: noop, resetCachedPrefs: noop, schedule: noop, updatePrefs: noop, warm: noop }),
    useAutomationHierarchyUiRuntime: () => ({ coordinator: { getRevision: () => 0 }, hydrate: noop, markPersisted: noop, reset: noop }),
    useAutomationProjectRuntime: () => ({ openProject: state.openProject, closeProject: noop, loadFlowDetails: noop, loadNodeDefinitions: noop, loadRecording: noop, loadTimeline: noop, notifyChanged: noop, refreshRuntime: noop }),
    useAutomationGraphRuntime: () => ({ draft: null, baseGraph: null, problems: [], recoverableDraft: null }),
    useAutomationSelectionNavigation: () => ({ openView: state.openView }),
    useAutomationRecordingCommands: () => ({}),
    useAutomationHierarchyCommandBridge: () => ({ createFlow: state.createFlow }),
    useAutomationSessionDirtyGuards: () => ({ guardedCloseProject: noop, selectTreeItem: noop }),
    useAdaptationWorkspaceNavigation: () => ({}),
    useConversationWorkspaceNavigation: () => ({}),
    useAutomationConnectedRegionSurfaces: () => ({ hierarchySurface: null, timelineSurface: null }),
    useAutomationExternalLifecycle: noop, useAutomationGatewayRecordingBridge: noop,
    useAutomationDeepLinkRuntime: state.deepLink,
    useStableAutomationEvent: (callback: unknown) => callback
  };
});
vi.mock("../../view-host", () => ({ useAutomationConnectedViewEntries: () => [], useAutomationConnectedViewSource: () => ({}), useAutomationConnectorCommands: () => ({}) }));
vi.mock("../../../project", () => ({ useAutomationProjectCatalogLoader: () => () => undefined }));
vi.mock("../../../sync", () => ({ useAutomationProjectPreload: () => undefined }));
vi.mock("../../../conversation/components", () => ({ ConversationDock: () => <aside>Conversation</aside> }));
vi.mock("../AutomationStudioProjectGate", () => ({ AutomationStudioProjectGate: (props: { state: string; onOpenProject: (id: string) => void }) => <section><p>{props.state === "restoring" ? "Project restoring" : "Catalog remains usable"}</p><button onClick={() => props.onOpenProject("chosen")}>Choose project</button></section> }));
vi.mock("../AutomationStudioWorkspaceComposition", () => ({ AutomationStudioWorkspaceComposition: () => {
  const [draft, setDraft] = useState("workspace draft");
  useEffect(() => { state.mounts(); return () => { state.unmounts(); }; }, []);
  return <button onClick={() => setDraft("retained edit")}>{draft}</button>;
} }));
import { AutomationStudioSession } from "../AutomationStudioSession";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let renderer: ReactTestRenderer | undefined;
beforeEach(() => { vi.clearAllMocks(); });
afterEach(async () => { if (renderer) await act(async () => renderer!.unmount()); renderer = undefined; vi.unstubAllGlobals(); });
function session() { return <AutomationStudioSession currentUser={{ id: "user.one", displayName: "User", roleId: "user", totpEnabled: false, pinConfigured: false }} runtime={{} as any} />; }
async function mount(query: string, projectId: string | null, hydrated = true) {
  state.query = query;
  const stores = createAutomationStudioStores();
  stores.catalog.setLoaded(true);
  if (projectId) stores.catalog.setProjects([{ id: projectId, name: "Project", type: "project" } as any]);
  stores.catalog.activate(projectId);
  stores.projectData.setResource("loadedProjectHierarchyId", hydrated ? projectId : null);
  state.foundation = { api: {}, owners: { studioStores: stores, studioUiStore: createAutomationStudioUiStore(), workspaceRenderStore: createAutomationWorkspaceRenderStore(defaultAutomationWorkspacePrefs()) }, activeProjectId: projectId, requests: { runLatest: vi.fn(), cancelAll: vi.fn() }, projectGeneration: { current: () => 0, isCurrent: () => true }, projectDataPlatform: { stats: () => ({}) }, liveCommands: {}, liveCommandScope: {}, uiCache: {} };
  const location = { pathname: "/programs/automation-studio", search: `?${query}`, hash: "" };
  const history = { state: {}, replaceState: vi.fn((_s: unknown, _t: string, next: string) => { location.search = new URL(next, "https://panel.invalid").search; }) };
  vi.stubGlobal("window", { location, history });
  await act(async () => { renderer = create(session()); });
  return { location, history, stores };
}
function button(label: string) { return renderer!.root.findAllByType("button").find((item) => item.children.includes(label))!; }
it.each(["describe", "demonstrate", "extract"])("wires actual Session %s guidance to its existing command", async (intent) => {
  const { location } = await mount(`start=${intent}&project=p&domainId=web`, "p");
  expect(state.createFlow).not.toHaveBeenCalled(); expect(state.openView).not.toHaveBeenCalled();
  await act(async () => button("workspace draft").props.onClick());
  await act(async () => button(intent === "describe" ? "Create automation" : "Open Connected browsers").props.onClick());
  expect(new URLSearchParams(location.search).has("start")).toBe(false);
  expect(button("retained edit")).toBeDefined(); expect(state.mounts).toHaveBeenCalledTimes(1); expect(state.unmounts).not.toHaveBeenCalled();
  if (intent === "describe") { expect(state.createFlow).toHaveBeenCalledTimes(1); expect(state.openView).not.toHaveBeenCalled(); }
  else { expect(state.openView).toHaveBeenCalledWith(automationStudioViewId.clients, "preview"); expect(state.createFlow).not.toHaveBeenCalled(); }
});
it("keeps catalog selection explicit and retains intent", async () => {
  const { location, history } = await mount("start=describe", null);
  expect(JSON.stringify(renderer!.toJSON())).toContain("Catalog remains usable");
  expect(state.openProject).not.toHaveBeenCalled(); expect(state.createFlow).not.toHaveBeenCalled();
  await act(async () => button("Choose project").props.onClick());
  expect(state.openProject).toHaveBeenCalledWith("chosen");
  expect(location.search).toBe("?start=describe"); expect(history.replaceState).not.toHaveBeenCalled();
});
it("disables next action until the selected hierarchy is loaded", async () => {
  await mount("start=describe&project=p", "p", false);
  expect(button("Create automation").props.disabled).toBe(true);
  await act(async () => button("Create automation").props.onClick());
  expect(state.createFlow).not.toHaveBeenCalled();
});
it("gives canonical flow/subflow/view/detail the unchanged restoration input and no guided action", async () => {
  const query = "project=p&flow=f&subflow=s&view=runtime-debug&detail=run%3Ar&domainId=web&start=describe";
  const { location, history } = await mount(query, "p");
  expect(renderer!.root.findAllByType("button").map((item) => item.children)).not.toContainEqual(["Create automation"]);
  expect(state.deepLink.mock.calls.at(-1)![0].deepLink).toEqual({ projectId: "p", flowId: "f", subflowId: "s", viewId: "runtime-debug", detail: { kind: "run", id: "r" } });
  expect(state.createFlow).not.toHaveBeenCalled(); expect(state.openView).not.toHaveBeenCalled(); expect(history.replaceState).not.toHaveBeenCalled(); expect(location.search).toBe(`?${query}`);
});
it("does not remount a live workspace when dismissed", async () => {
  await mount("project=p&start=describe", "p");
  await act(async () => button("workspace draft").props.onClick());
  await act(async () => button("Dismiss").props.onClick());
  expect(button("retained edit")).toBeDefined(); expect(state.mounts).toHaveBeenCalledTimes(1); expect(state.unmounts).not.toHaveBeenCalled();
  expect(state.createFlow).not.toHaveBeenCalled(); expect(state.openView).not.toHaveBeenCalled();
});
