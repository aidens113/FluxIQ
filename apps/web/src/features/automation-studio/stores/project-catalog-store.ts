import { createScopedExternalStore, type ScopedExternalStore } from "./external-store";

export type AutomationProjectCatalogState<Project = any, Category = any> = {
  projects: readonly Project[];
  categories: readonly Category[];
  activeProjectId: string | null;
  loaded: boolean;
  loading: boolean;
  error: string | null;
};

export type AutomationProjectCatalogStore<Project = any, Category = any> = ScopedExternalStore<AutomationProjectCatalogState<Project, Category>> & {
  activate(projectId: string | null): boolean;
  setCategories(categories: readonly Category[]): boolean;
  setLoaded(loaded: boolean): boolean;
  setLoading(loading: boolean): boolean;
  setProjects(projects: readonly Project[]): boolean;
  setError(error: string | null): boolean;
};

export function createAutomationProjectCatalogStore<Project = any, Category = any>(
  initial: AutomationProjectCatalogState<Project, Category> = {
    projects: [],
    categories: [],
    activeProjectId: null,
    loaded: false,
    loading: false,
    error: null
  }
): AutomationProjectCatalogStore<Project, Category> {
  const store = createScopedExternalStore(initial);
  return {
    ...store,
    activate: (activeProjectId) => store.update((current) => current.activeProjectId === activeProjectId ? current : { ...current, activeProjectId }, ["active-project"]),
    setCategories: (categories) => store.update((current) => shallowArraySame(current.categories, categories) ? current : { ...current, categories }, ["categories"]),
    setLoaded: (loaded) => store.update((current) => current.loaded === loaded ? current : { ...current, loaded }, ["status"]),
    setLoading: (loading) => store.update((current) => current.loading === loading ? current : { ...current, loading }, ["status"]),
    setProjects: (projects) => store.update((current) => shallowArraySame(current.projects, projects) ? current : { ...current, projects }, ["projects"]),
    setError: (error) => store.update((current) => current.error === error ? current : { ...current, error }, ["status"])
  };
}

function shallowArraySame<T>(left: readonly T[], right: readonly T[]): boolean {
  return left === right || (left.length === right.length && left.every((item, index) => Object.is(item, right[index])));
}
