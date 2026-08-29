import type { AutomationStudioOverlayState } from "./contracts";
import type {
  AutomationStudioOverlayKey,
  AutomationStudioOverlayRequest,
  AutomationStudioOverlayStore
} from "./overlay-state-store";

export type AutomationStudioOverlayChannel<K extends AutomationStudioOverlayKey> = {
  close(requestId?: string): boolean;
  current(): AutomationStudioOverlayState[K];
  open(request: AutomationStudioOverlayRequest<K>): boolean;
};

export type AutomationStudioOverlayController = {
  [K in AutomationStudioOverlayKey]: AutomationStudioOverlayChannel<K>;
} & {
  closeAll(): readonly AutomationStudioOverlayKey[];
};

function channel<K extends AutomationStudioOverlayKey>(
  store: AutomationStudioOverlayStore,
  key: K
): AutomationStudioOverlayChannel<K> {
  return {
    close: (requestId) => store.close(key, requestId),
    current: () => store.getState()[key],
    open: (request) => store.open(key, request)
  };
}

export function createAutomationStudioOverlayController(
  store: AutomationStudioOverlayStore
): AutomationStudioOverlayController {
  return {
    project: channel(store, "project"),
    hierarchy: channel(store, "hierarchy"),
    preferences: channel(store, "preferences"),
    viewAdder: channel(store, "viewAdder"),
    layoutPicker: channel(store, "layoutPicker"),
    dataInspector: channel(store, "dataInspector"),
    inspectorDrawer: channel(store, "inspectorDrawer"),
    drawer: channel(store, "drawer"),
    closeAll: () => store.reset()
  };
}

type AdoptionEntry = {
  dispatcher: string | null;
  legacyOwner: string;
  storeKey: AutomationStudioOverlayKey;
  subscriber: string;
};

export const automationStudioOverlayRootAdoptionMap = {
  project: {
    dispatcher: "dispatchers.project",
    legacyOwner: "project dialog state and project/category mutation handlers",
    storeKey: "project",
    subscriber: "ProjectOverlaySubscriber"
  },
  hierarchy: {
    dispatcher: "dispatchers.hierarchy",
    legacyOwner: "hierarchy create/delete dialog state and confirmation handlers",
    storeKey: "hierarchy",
    subscriber: "HierarchyActionOverlaySubscriber"
  },
  preferences: {
    dispatcher: "dispatchers.preferences",
    legacyOwner: "workspace preferences modal state",
    storeKey: "preferences",
    subscriber: "PreferencesOverlaySubscriber"
  },
  viewAdder: {
    dispatcher: "dispatchers.view",
    legacyOwner: "window-adder anchor and floating panel JSX",
    storeKey: "viewAdder",
    subscriber: "ViewAdderOverlaySubscriber"
  },
  layoutPicker: {
    dispatcher: "dispatchers.layout",
    legacyOwner: "layout-picker anchor and floating panel JSX",
    storeKey: "layoutPicker",
    subscriber: "LayoutPickerOverlaySubscriber"
  },
  dataInspector: {
    dispatcher: null,
    legacyOwner: "development data-inspector visibility",
    storeKey: "dataInspector",
    subscriber: "DataInspectorOverlaySubscriber"
  },
  inspectorDrawer: {
    dispatcher: null,
    legacyOwner: "narrow inspector drawer state and JSX",
    storeKey: "inspectorDrawer",
    subscriber: "InspectorDrawerSubscriber"
  },
  drawer: {
    dispatcher: null,
    legacyOwner: "narrow hierarchy/timeline drawer state and JSX",
    storeKey: "drawer",
    subscriber: "HierarchyDrawerSubscriber | TimelineDrawerSubscriber"
  }
} as const satisfies Record<AutomationStudioOverlayKey, AdoptionEntry>;

export const automationStudioOverlayRootAdoptionSteps = [
  "Create one overlay store and controller per mounted Automation Studio project shell.",
  "Memoize AutomationStudioOverlayDispatchers and AutomationStudioOverlaySurfaces at the root boundary.",
  "Replace each legacy owner using automationStudioOverlayRootAdoptionMap and controller.<channel>.open(request).",
  "Provide hierarchy requests a stable indexed folder source whose search method honors its requested limit.",
  "Render one AutomationStudioOverlays instance beside the workspace shell.",
  "On project close or switch, call controller.closeAll() before disposing project-scoped bindings.",
  "Delete legacy overlay state, render arrays, modal JSX, and global overlay event channels."
] as const;
