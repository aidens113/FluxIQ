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
  entityIds: Record<AutomationProjectEntityKind, readonly string[]>;
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
    entityIds: emptyAutomationEntityIds(),
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

export function automationEntityDetailScope(kind: AutomationProjectEntityKind, id?: string): string {
  return id ? `entity-detail:${kind}:${id}` : `entity-details:${kind}`;
}

const entityMapSelectors = new Map<
  AutomationProjectEntityKind,
  (state: AutomationProjectDataState) => ReadonlyMap<string, unknown>
>();
const entityIdSelectors = new Map<
  AutomationProjectEntityKind,
  (state: AutomationProjectDataState) => readonly string[]
>();
const entitySelectors = new Map<string, (state: AutomationProjectDataState) => unknown>();
const entityCollectionSelectors = new Map<
  AutomationProjectEntityKind,
  (state: AutomationProjectDataState) => readonly unknown[]
>();

export function automationEntityMapSelector(kind: AutomationProjectEntityKind) {
  const cached = entityMapSelectors.get(kind);
  if (cached) return cached;
  const selector = (state: AutomationProjectDataState) => state.entities[kind];
  entityMapSelectors.set(kind, selector);
  return selector;
}

export function automationEntityIdsSelector(kind: AutomationProjectEntityKind) {
  const cached = entityIdSelectors.get(kind);
  if (cached) return cached;
  const selector = (state: AutomationProjectDataState) => state.entityIds[kind];
  entityIdSelectors.set(kind, selector);
  return selector;
}

export function automationEntitySelector(kind: AutomationProjectEntityKind, id: string) {
  const key = `${kind}:${id}`;
  const cached = entitySelectors.get(key);
  if (cached) return cached;
  const selector = (state: AutomationProjectDataState) => state.entities[kind].get(id);
  entitySelectors.set(key, selector);
  return selector;
}

export function automationEntityCollectionSelector(kind: AutomationProjectEntityKind) {
  const cached = entityCollectionSelectors.get(kind);
  if (cached) return cached;
  const valuesByMap = new WeakMap<
    ReadonlyMap<string, unknown>,
    WeakMap<readonly string[], readonly unknown[]>
  >();
  const selector = (state: AutomationProjectDataState) => {
    const map = state.entities[kind];
    const ids = state.entityIds[kind];
    let valuesByIds = valuesByMap.get(map);
    if (!valuesByIds) {
      valuesByIds = new WeakMap();
      valuesByMap.set(map, valuesByIds);
    }
    const previousValues = valuesByIds.get(ids);
    if (previousValues) return previousValues;
    const values = Object.freeze(ids.map((id) => map.get(id)));
    valuesByIds.set(ids, values);
    return values;
  };
  entityCollectionSelectors.set(kind, selector);
  return selector;
}

function emptyAutomationEntityIds(): Record<AutomationProjectEntityKind, readonly string[]> {
  const ids = {} as Record<AutomationProjectEntityKind, readonly string[]>;
  for (const kind of entityKinds) ids[kind] = Object.freeze([]);
  return ids;
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
      const entityScopes = entityKinds.flatMap((kind) => [
        automationEntityScope(kind),
        automationEntityDetailScope(kind),
        ...current.entityIds[kind].flatMap((id) => [
          automationEntityScope(kind, id),
          automationEntityDetailScope(kind, id)
        ])
      ]).concat(
        [...current.detailStatus.keys()].map((key) => `entity-detail:${key}`)
      );
      return store.replace(next, [
        "project",
        ...entityScopes,
        "pages",
        ...[...current.pages.keys()].map((key) => `page:${key}`),
        "resources",
        ...[...current.resources.keys()].map((key) => `resource:${key}`)
      ]);
    },
    upsert(kind, id, value, status = "detail") {
      const current = store.getState();
      const exists = current.entities[kind].has(id);
      const entityChanged = !exists || !Object.is(current.entities[kind].get(id), value);
      const detailChanged = current.detailStatus.get(detailKey(kind, id)) !== status;
      if (!entityChanged && !detailChanged) return false;
      const entities = entityChanged
        ? { ...current.entities, [kind]: new Map(current.entities[kind]).set(id, value) }
        : current.entities;
      const entityIds = entityChanged && !exists
        ? { ...current.entityIds, [kind]: Object.freeze([...current.entityIds[kind], id]) }
        : current.entityIds;
      const detailStatus = detailChanged
        ? new Map(current.detailStatus).set(detailKey(kind, id), status)
        : current.detailStatus;
      const scopes = [
        ...(entityChanged ? [automationEntityScope(kind), automationEntityScope(kind, id)] : []),
        ...(detailChanged ? [automationEntityDetailScope(kind), automationEntityDetailScope(kind, id)] : [])
      ];
      return store.replace({ ...current, entities, entityIds, detailStatus }, scopes);
    },
    replaceAll(kind, entries) {
      const current = store.getState();
      const previous = current.entities[kind];
      const normalized = normalizeEntityEntries(entries);
      const ids = stableEntityIds(current.entityIds[kind], normalized.map(([id]) => id));
      const nextMap = new Map(normalized);
      const changedEntityIds = changedMapIds(previous, nextMap);
      const mapChanged = changedEntityIds.length > 0;
      const orderChanged = ids !== current.entityIds[kind];
      const detailChanges = changedDetailIds(current.detailStatus, kind, ids);
      if (!mapChanged && !orderChanged && detailChanges.length === 0) return false;

      const entities = mapChanged
        ? { ...current.entities, [kind]: nextMap }
        : current.entities;
      const entityIds = orderChanged
        ? { ...current.entityIds, [kind]: ids }
        : current.entityIds;
      let detailStatus = current.detailStatus;
      if (detailChanges.length > 0) {
        const nextDetailStatus = new Map(current.detailStatus);
        for (const key of nextDetailStatus.keys()) {
          if (key.startsWith(`${kind}:`)) nextDetailStatus.delete(key);
        }
        for (const id of ids) nextDetailStatus.set(detailKey(kind, id), "detail");
        detailStatus = nextDetailStatus;
      }
      const scopes = [
        ...(mapChanged || orderChanged ? [automationEntityScope(kind)] : []),
        ...changedEntityIds.map((id) => automationEntityScope(kind, id)),
        ...(detailChanges.length > 0 ? [automationEntityDetailScope(kind)] : []),
        ...detailChanges.map((id) => automationEntityDetailScope(kind, id))
      ];
      return store.replace(
        { ...current, entities, entityIds, detailStatus },
        scopes
      );
    },
    remove(kind, id) {
      const current = store.getState();
      if (!current.entities[kind].has(id)) return false;
      const kindEntities = new Map(current.entities[kind]);
      kindEntities.delete(id);
      const entityIds = {
        ...current.entityIds,
        [kind]: Object.freeze(current.entityIds[kind].filter((entityId) => entityId !== id))
      };
      const detailStatus = new Map(current.detailStatus);
      detailStatus.delete(detailKey(kind, id));
      return store.replace(
        { ...current, entities: { ...current.entities, [kind]: kindEntities }, entityIds, detailStatus },
        [
          automationEntityScope(kind),
          automationEntityScope(kind, id),
          automationEntityDetailScope(kind),
          automationEntityDetailScope(kind, id)
        ]
      );
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
      return store.replace(
        { ...current, detailStatus: new Map(current.detailStatus).set(key, status) },
        [automationEntityDetailScope(kind), automationEntityDetailScope(kind, id)]
      );
    },
    setPage(key, page) {
      const current = store.getState();
      const previous = current.pages.get(key);
      const ids = stableEntityIds(previous?.ids ?? [], page.ids);
      const normalized = { ...page, ids };
      if (previous && samePage(previous, normalized)) return false;
      return store.replace({ ...current, pages: new Map(current.pages).set(key, normalized) }, [`page:${key}`, "pages"]);
    }
  };
}

function normalizeEntityEntries(
  entries: readonly (readonly [string, unknown])[]
): readonly (readonly [string, unknown])[] {
  const indexes = new Map<string, number>();
  const normalized: (readonly [string, unknown])[] = [];
  for (const [id, value] of entries) {
    const index = indexes.get(id);
    if (index === undefined) {
      indexes.set(id, normalized.length);
      normalized.push([id, value]);
    } else {
      normalized[index] = [id, value];
    }
  }
  return normalized;
}

function changedMapIds(
  previous: ReadonlyMap<string, unknown>,
  next: ReadonlyMap<string, unknown>
): readonly string[] {
  const changed = new Set<string>();
  for (const [id, value] of previous) {
    if (!next.has(id) || !Object.is(next.get(id), value)) changed.add(id);
  }
  for (const [id, value] of next) {
    if (!previous.has(id) || !Object.is(previous.get(id), value)) changed.add(id);
  }
  return [...changed];
}

function changedDetailIds(
  previous: ReadonlyMap<string, AutomationEntityDetailStatus>,
  kind: AutomationProjectEntityKind,
  nextIds: readonly string[]
): readonly string[] {
  const prefix = `${kind}:`;
  const nextIdSet = new Set(nextIds);
  const changed = new Set<string>();
  for (const [key, status] of previous) {
    if (!key.startsWith(prefix)) continue;
    const id = key.slice(prefix.length);
    if (!nextIdSet.has(id) || status !== "detail") changed.add(id);
  }
  for (const id of nextIds) {
    if (previous.get(`${kind}:${id}`) !== "detail") changed.add(id);
  }
  return [...changed];
}

function stableEntityIds(previous: readonly string[], next: readonly string[]): readonly string[] {
  if (previous.length === next.length && previous.every((id, index) => id === next[index])) return previous;
  return Object.freeze([...next]);
}

function samePage(left: AutomationPageState, right: AutomationPageState): boolean {
  return left.ids === right.ids
    && left.total === right.total
    && left.limit === right.limit
    && left.offset === right.offset
    && left.nextCursor === right.nextCursor;
}
