import { createScopedExternalStore, type ScopedExternalStore } from './external-store';

export type AutomationQueryScalar = string | number | boolean | null;
export type AutomationQueryFilterValue = AutomationQueryScalar | readonly AutomationQueryScalar[];
export type AutomationQueryFilter = Readonly<Record<string, AutomationQueryFilterValue>>;
export type AutomationQuerySort = { field: string; direction: 'asc' | 'desc' };

export type AutomationProjectQuery = {
  projectId: string;
  scope: string;
  filter?: AutomationQueryFilter | string | null;
  sort?: readonly AutomationQuerySort[] | string | null;
  page: number;
  pageSize: number;
};

export type NormalizedAutomationProjectQuery = {
  projectId: string;
  scope: string;
  filter: string;
  sort: string;
  page: number;
  pageSize: number;
};

declare const automationQueryKeyBrand: unique symbol;
export type AutomationQueryKey = string & { readonly [automationQueryKeyBrand]: true };
export type AutomationQueryFreshness = 'missing' | 'fresh' | 'stale';

export type AutomationQuerySnapshot = {
  key: AutomationQueryKey;
  query: NormalizedAutomationProjectQuery;
  ids: readonly string[];
  total: number;
  loading: boolean;
  error: string | null;
  freshness: AutomationQueryFreshness;
  updatedAt: number | null;
  nextCursor: string | null;
};

export type AutomationQueryResult = {
  ids: readonly string[];
  total: number;
  updatedAt?: number;
  nextCursor?: string | null;
};

export type AutomationProjectQueryState = {
  queries: ReadonlyMap<AutomationQueryKey, AutomationQuerySnapshot>;
};

export type AutomationProjectQueryStore = ScopedExternalStore<AutomationProjectQueryState> & {
  getQuery(query: AutomationProjectQuery | AutomationQueryKey): AutomationQuerySnapshot;
  setLoading(query: AutomationProjectQuery, loading?: boolean): boolean;
  setResult(query: AutomationProjectQuery, result: AutomationQueryResult): boolean;
  setError(query: AutomationProjectQuery, error: string): boolean;
  markStale(query: AutomationProjectQuery): boolean;
  remove(query: AutomationProjectQuery): boolean;
  clearProject(projectId: string): boolean;
};

const normalizedQueryCache = new Map<AutomationQueryKey, NormalizedAutomationProjectQuery>();
const emptyQueryCache = new Map<AutomationQueryKey, AutomationQuerySnapshot>();
const querySelectorCache = new Map<AutomationQueryKey, (state: AutomationProjectQueryState) => AutomationQuerySnapshot>();
const queryIdsSelectorCache = new Map<AutomationQueryKey, (state: AutomationProjectQueryState) => readonly string[]>();

export function normalizeAutomationProjectQuery(query: AutomationProjectQuery): NormalizedAutomationProjectQuery {
  const projectId = requiredPart(query.projectId, 'projectId');
  const scope = requiredPart(query.scope, 'scope');
  const page = nonNegativeInteger(query.page, 'page');
  const pageSize = positiveInteger(query.pageSize, 'pageSize');
  const filter = normalizeFilter(query.filter);
  const sort = normalizeSort(query.sort);
  const key = encodeAutomationQueryKey({ projectId, scope, filter, sort, page, pageSize });
  const cached = normalizedQueryCache.get(key);
  if (cached) return cached;
  const normalized = Object.freeze({ projectId, scope, filter, sort, page, pageSize });
  normalizedQueryCache.set(key, normalized);
  return normalized;
}

export function automationQueryKey(query: AutomationProjectQuery): AutomationQueryKey {
  return encodeAutomationQueryKey(normalizeAutomationProjectQuery(query));
}

export function automationQueryScope(query: AutomationProjectQuery | AutomationQueryKey): string {
  const key = typeof query === 'string' ? query : automationQueryKey(query);
  return `query:${key}`;
}

export function automationQueryProjectScope(projectId: string): string {
  return `queries:project:${requiredPart(projectId, 'projectId')}`;
}

export function automationQueryCollectionScope(projectId: string, scope: string): string {
  return `queries:scope:${requiredPart(projectId, 'projectId')}:${requiredPart(scope, 'scope')}`;
}

export function automationQuerySelector(query: AutomationProjectQuery) {
  const key = automationQueryKey(query);
  const cached = querySelectorCache.get(key);
  if (cached) return cached;
  const selector = (state: AutomationProjectQueryState) => state.queries.get(key) ?? emptyQuery(key);
  querySelectorCache.set(key, selector);
  return selector;
}

export function automationQueryIdsSelector(query: AutomationProjectQuery) {
  const key = automationQueryKey(query);
  const cached = queryIdsSelectorCache.get(key);
  if (cached) return cached;
  const selectQuery = automationQuerySelector(query);
  const selector = (state: AutomationProjectQueryState) => selectQuery(state).ids;
  queryIdsSelectorCache.set(key, selector);
  return selector;
}

export function createAutomationProjectQueryStore(
  initial: AutomationProjectQueryState = { queries: new Map() }
): AutomationProjectQueryStore {
  const store = createScopedExternalStore(initial);

  const getQuery = (query: AutomationProjectQuery | AutomationQueryKey) => {
    const key = typeof query === 'string' ? query : automationQueryKey(query);
    return store.getState().queries.get(key) ?? emptyQuery(key);
  };

  const replaceQuery = (next: AutomationQuerySnapshot) => {
    const currentState = store.getState();
    const current = currentState.queries.get(next.key);
    if (current && sameQuerySnapshot(current, next)) return false;
    const queries = new Map(currentState.queries).set(next.key, next);
    return store.replace(
      { queries },
      [
        automationQueryScope(next.key),
        automationQueryCollectionScope(next.query.projectId, next.query.scope),
        automationQueryProjectScope(next.query.projectId)
      ]
    );
  };

  return {
    ...store,
    getQuery,
    setLoading(query, loading = true) {
      const current = getQuery(query);
      if (current.loading === loading && (!loading || current.error === null)) return false;
      return replaceQuery({
        ...current,
        loading,
        error: loading ? null : current.error
      });
    },
    setResult(query, result) {
      const current = getQuery(query);
      const ids = stableIds(current.ids, result.ids);
      const total = nonNegativeInteger(result.total, 'total');
      const nextCursor = result.nextCursor ?? null;
      const updatedAt = result.updatedAt ?? (current.freshness === "fresh" ? current.updatedAt : Date.now());
      if (
        current.freshness === 'fresh'
        && !current.loading
        && current.error === null
        && current.ids === ids
        && current.total === total
        && current.updatedAt === updatedAt
        && current.nextCursor === nextCursor
      ) return false;
      return replaceQuery({
        ...current,
        ids,
        total,
        loading: false,
        error: null,
        freshness: 'fresh',
        updatedAt,
        nextCursor
      });
    },
    setError(query, error) {
      const current = getQuery(query);
      const normalizedError = error.trim() || 'Unknown query error';
      const freshness = current.freshness === "fresh" ? "stale" : current.freshness;
      if (!current.loading && current.error === normalizedError && current.freshness === freshness) return false;
      return replaceQuery({ ...current, loading: false, error: normalizedError, freshness });
    },
    markStale(query) {
      const current = getQuery(query);
      if (current.freshness === 'stale') return false;
      return replaceQuery({ ...current, freshness: 'stale' });
    },
    remove(query) {
      const key = automationQueryKey(query);
      const current = store.getState();
      if (!current.queries.has(key)) return false;
      const queries = new Map(current.queries);
      queries.delete(key);
      return store.replace(
        { queries },
        [
          automationQueryScope(key),
          automationQueryCollectionScope(query.projectId, query.scope),
          automationQueryProjectScope(query.projectId)
        ]
      );
    },
    clearProject(projectId) {
      const normalizedProjectId = requiredPart(projectId, 'projectId');
      const current = store.getState();
      const queries = new Map(current.queries);
      const removed: AutomationQuerySnapshot[] = [];
      for (const [key, query] of queries) {
        if (query.query.projectId !== normalizedProjectId) continue;
        removed.push(query);
        queries.delete(key);
      }
      if (!removed.length) return false;
      const collectionScopes = new Set(
        removed.map((query) => automationQueryCollectionScope(query.query.projectId, query.query.scope))
      );
      return store.replace(
        { queries },
        [
          automationQueryProjectScope(normalizedProjectId),
          ...collectionScopes,
          ...removed.map((query) => automationQueryScope(query.key))
        ]
      );
    }
  };
}

function emptyQuery(key: AutomationQueryKey): AutomationQuerySnapshot {
  const cached = emptyQueryCache.get(key);
  if (cached) return cached;
  const query = normalizedQueryCache.get(key) ?? decodeAutomationQueryKey(key);
  const snapshot = Object.freeze({
    key,
    query,
    ids: Object.freeze([]) as readonly string[],
    total: 0,
    loading: false,
    error: null,
    freshness: 'missing' as const,
    updatedAt: null,
    nextCursor: null
  });
  emptyQueryCache.set(key, snapshot);
  return snapshot;
}

function stableIds(previous: readonly string[], next: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const id of next) {
    const value = requiredPart(id, 'id');
    if (seen.has(value)) continue;
    seen.add(value);
    normalized.push(value);
  }
  if (previous.length === normalized.length && previous.every((id, index) => id === normalized[index])) return previous;
  return Object.freeze(normalized);
}

function normalizeFilter(filter: AutomationProjectQuery['filter']): string {
  if (filter == null || filter === '') return '';
  if (typeof filter === 'string') return filter.trim();
  const normalized: Record<string, AutomationQueryFilterValue> = {};
  for (const key of Object.keys(filter).sort()) {
    const value = filter[key];
    if (value === undefined) continue;
    normalized[key] = Array.isArray(value) ? [...value] : value;
  }
  return JSON.stringify(normalized);
}

function normalizeSort(sort: AutomationProjectQuery['sort']): string {
  if (sort == null || sort === '') return '';
  if (typeof sort === 'string') return sort.trim();
  return JSON.stringify(sort.map((entry) => ({
    field: requiredPart(entry.field, 'sort field'),
    direction: entry.direction
  })));
}

function encodeAutomationQueryKey(query: NormalizedAutomationProjectQuery): AutomationQueryKey {
  return JSON.stringify([
    query.projectId,
    query.scope,
    query.filter,
    query.sort,
    query.page,
    query.pageSize
  ]) as AutomationQueryKey;
}

function decodeAutomationQueryKey(key: AutomationQueryKey): NormalizedAutomationProjectQuery {
  const parsed = JSON.parse(key) as [string, string, string, string, number, number];
  const query = Object.freeze({
    projectId: parsed[0],
    scope: parsed[1],
    filter: parsed[2],
    sort: parsed[3],
    page: parsed[4],
    pageSize: parsed[5]
  });
  normalizedQueryCache.set(key, query);
  return query;
}

function requiredPart(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`Automation query ${name} is required.`);
  return normalized;
}

function nonNegativeInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Automation query ${name} must be a non-negative integer.`);
  }
  return value;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`Automation query ${name} must be a positive integer.`);
  }
  return value;
}

function sameQuerySnapshot(left: AutomationQuerySnapshot, right: AutomationQuerySnapshot): boolean {
  return left.ids === right.ids
    && left.total === right.total
    && left.loading === right.loading
    && left.error === right.error
    && left.freshness === right.freshness
    && left.updatedAt === right.updatedAt
    && left.nextCursor === right.nextCursor;
}
