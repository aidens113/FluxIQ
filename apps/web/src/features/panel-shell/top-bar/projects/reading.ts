import type { ProjectChoice } from "./choice";

/** What the panel knows about the person's projects. `loaded` flips once the first read ends, either way. */
export type ProjectsReading = { projects: ProjectChoice[]; failed: boolean; loaded: boolean };

export const PROJECTS_NOT_READ: ProjectsReading = { projects: [], failed: false, loaded: false };
