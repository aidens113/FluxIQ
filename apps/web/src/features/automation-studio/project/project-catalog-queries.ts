import type { AutomationStudioProject, AutomationStudioProjectCategory } from "../hierarchy/model";
import type { AutomationProjectCatalogStore } from "../stores";
import type { AutomationProjectApi } from "./project-api";

export async function loadAutomationProjectCatalog(
  api: AutomationProjectApi,
  store: AutomationProjectCatalogStore<AutomationStudioProject, AutomationStudioProjectCategory>,
  signal?: AbortSignal
): Promise<{ categories: AutomationStudioProjectCategory[]; projects: AutomationStudioProject[] }> {
  store.transaction(() => {
    store.setLoading(true);
    store.setError(null);
  });
  const result = await api.get<{ categories?: AutomationStudioProjectCategory[]; projects?: AutomationStudioProject[] }>(
    "projects",
    signal ? { signal } : {}
  );
  if (result.aborted || signal?.aborted) return { categories: [], projects: [] };
  if (!result.ok) {
    store.transaction(() => {
      store.setLoading(false);
      store.setLoaded(true);
      store.setError(result.error ?? "Projects could not be loaded.");
    });
    throw new Error(result.error ?? "Projects could not be loaded.");
  }
  const categories = result.payload?.categories ?? [];
  const projects = result.payload?.projects ?? [];
  store.transaction(() => {
    store.setCategories(categories);
    store.setProjects(projects);
    store.setLoaded(true);
    store.setLoading(false);
  });
  return { categories, projects };
}