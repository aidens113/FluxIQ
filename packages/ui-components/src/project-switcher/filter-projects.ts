import type { ProjectSummary } from "./project-summary.ts";

/** The projects whose name has every word of `query`, in their given order; all of them for a blank query. */
export function filterProjects(projects: readonly ProjectSummary[], query: string): ProjectSummary[] {
  const words = query.toLowerCase().split(/\s+/u).filter(Boolean);
  if (words.length === 0) return [...projects];
  return projects.filter((project) => {
    const name = project.name.toLowerCase();
    return words.every((word) => name.includes(word));
  });
}
