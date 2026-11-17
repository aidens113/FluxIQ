import { createSharedSource, type SharedSource } from "../../shared";
import type { ProgramCommandTransport } from "../../../automation-studio/data/program-transport";
import { PROJECTS_CHANGED_EVENT } from "./changed";
import { PROJECTS_NOT_READ, type ProjectsReading } from "./reading";

type ProjectRows = { projects?: Array<{ id?: unknown; name?: unknown }> };

/** The transport the source reads through; the latest component to render supplies it. */
export const projectsTransport: { current: ProgramCommandTransport | undefined } = { current: undefined };

/**
 * The single projects list for the whole shell: one `projects` request per page load, read again when
 * a project changes or the tab is returned to. A failed read keeps the list from before.
 */
export const projectsSource: SharedSource<ProjectsReading> = createSharedSource<ProjectsReading>({
  initial: PROJECTS_NOT_READ,
  failed: (previous) => ({ projects: previous.projects, failed: true, loaded: true }),
  read: async (previous, signal) => {
    const studio = projectsTransport.current;
    if (!studio) return previous;
    const response = await studio.get<ProjectRows>("projects", { signal });
    if (response.aborted || signal.aborted) return previous;
    if (!response.ok) return { projects: previous.projects, failed: true, loaded: true };
    const projects = (response.payload?.projects ?? []).flatMap((project) =>
      typeof project.id === "string" && project.id
        ? [{ id: project.id, name: typeof project.name === "string" && project.name ? project.name : project.id }]
        : []);
    return { projects, failed: false, loaded: true };
  },
  listen: (refresh) => {
    if (typeof window === "undefined") return () => undefined;
    window.addEventListener(PROJECTS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(PROJECTS_CHANGED_EVENT, refresh);
  }
});
