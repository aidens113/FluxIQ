import { createScopedExternalStore, type ScopedExternalStore } from "./external-store";

export type AutomationProjectEntityKind =
  | "flows"
  | "recordings"
  | "timelines"
  | "proposals"
  | "adaptations"
  | "runs"
  | "nodes"
  | "artifacts"
  | "hierarchy";

export type AutomationEntityDetailStatus = "summary" | "loading" | "detail" | "error";
export type AutomationPageState = { ids: readonly string[]; total: number; limit: number; offset: number; nextCursor?: string | null };

export type AutomationProjectDataState = {
  activeProjectId: string | null;
  entities: Record<AutomationProjectEntityKind, ReadonlyMap<string, unknown>>;
  detailStatus: ReadonlyMap<string, AutomationEntityDetailStatus>;
  pages: ReadonlyMap<string, AutomationPageState>;
  resources: ReadonlyMap<string, unknown>;
};

export type AutomationProjectDataStore = ScopedExternalStore<AutomationProjectDataState> & {
  activate(projectId: string | null): boolean;
  clearProject(projectId?: string | null): boolean;
  upsert(kind: AutomationProjectEntityKind, id: string, value: unknown, detailStatus?: AutomationEntityDetailStatus): boolean;
  remove(kind: AutomationProjectEntityKind, id: string): boolean;
  replaceAll(kind: AutomationProjectEntityKind, entries: readonly (readonly [string, unknown])[]): boolean;
  setResource<Value>(key: string, value: Value): boolean;
  setDetailStatus(kind: AutomationProjectEntityKind, id: string, status: AutomationEntityDetailStatus): boolean;
  setPage(key: string, page: AutomationPageState): boolean;
};

const entityKinds: readonly AutomationProjectEntityKind[] = [
  "flows", "recordings", "timelines", "proposals", "adaptations", "runs", "nodes", "artifacts", "hierarchy"
];

export function emptyAutomationProjectDataState(): AutomationProjectDataState {
  return {
    activeProjectId: null,
    entities: emptyAutomationEntityMaps(),
    detailStatus: new Map(),
    pages: new Map(),
    resources: new Map()
  };
}

function emptyAutomationEntityMaps(): Record<AutomationProjectEntityKind, ReadonlyMap<string, unknown>> {
  const entities = {} as Record<AutomationProjectEntityKind, ReadonlyMap<string, unknown>>;
  for (const kind of entityKinds) entities[kind] = new Map<string, unknown>();
  return entities;
}

export function automationEntityScope(kind: AutomationProjectEntityKind, id?: string): string {
  return id ? `entity:${kind}:${id}` : `entities:${kind}`;
}

export function createAutomationProjectDataStore(initial: AutomationProjectDataState = emptyAutomationProjectDataState()): AutomationProjectDataStore {
  const store = createScopedExternalStore(initial);
  const detailKey = (kind: AutomationProjectEntityKind, id: string) => `${kind}:${id}`;
  return {
    ...store,
    activate(projectId) {
      return store.update((current) => current.activeProjectId === projectId ? current : { ...current, activeProjectId: projectId }, ["project"]);
    },
    clearProject(projectId) {
      const current = store.getState();
      if (projectId && current.activeProjectId !== projectId) return false;
      const next = emptyAutomationProjectDataState();
      next.activeProjectId = projectId ? null : current.activeProjectId;
      return store.replace(next, ["project", ...entityKinds.map((kind) => automationEntityScope(kind)), "pages", "details", "resources"]);
    },
    upsert(kind, id, value, status = "detail") {
      const current = store.getState();
      if (Object.is(current.entities[kind].get(id), value) && current.detailStatus.get(detailKey(kind, id)) === status) return false;
      const entities = { ...current.entities, [kind]: new Map(current.entities[kind]).set(id, value) };
      const detailStatus = new Map(current.detailStatus).set(detailKey(kind, id), status);
      return store.replace({ ...current, entities, detailStatus }, [automationEntityScope(kind), automationEntityScope(kind, id), "details"]);
    },
    replaceAll(kind, entries) {
      const current = store.getState();
      const previous = current.entities[kind];
      if (previous.size === entries.length && entries.every(([id, value]) => Object.is(previous.get(id), value))) return false;
      const entities = { ...current.entities, [kind]: new Map(entries) };
      const nextDetailStatus = new Map(current.detailStatus);
      for (const key of nextDetailStatus.keys()) {
        if (key.startsWith(kind + ":")) nextDetailStatus.delete(key);
      }
      for (const [id] of entries) nextDetailStatus.set(detailKey(kind, id), "detail");
      return store.replace(
        { ...current, entities, detailStatus: nextDetailStatus },
        [automationEntityScope(kind), "details"]
      );
    },
    remove(kind, id) {
      const current = store.getState();
      if (!current.entities[kind].has(id)) return false;
      const kindEntities = new Map(current.entities[kind]);
      kindEntities.delete(id);
      const detailStatus = new Map(current.detailStatus);
      detailStatus.delete(detailKey(kind, id));
      return store.replace({ ...current, entities: { ...current.entities, [kind]: kindEntities }, detailStatus }, [automationEntityScope(kind), automationEntityScope(kind, id), "details"]);
    },
    setResource(key, value) {
      const current = store.getState();
      if (Object.is(current.resources.get(key), value)) return false;
      return store.replace({ ...current, resources: new Map(current.resources).set(key, value) }, [`resource:${key}`]);
    },
    setDetailStatus(kind, id, status) {
      const current = store.getState();
      const key = detailKey(kind, id);
      if (current.detailStatus.get(key) === status) return false;
      return store.replace({ ...current, detailStatus: new Map(current.detailStatus).set(key, status) }, [automationEntityScope(kind, id), "details"]);
    },
    setPage(key, page) {
      const current = store.getState();
      if (current.pages.get(key) === page) return false;
      return store.replace({ ...current, pages: new Map(current.pages).set(key, page) }, [`page:${key}`, "pages"]);
    }
  };
}