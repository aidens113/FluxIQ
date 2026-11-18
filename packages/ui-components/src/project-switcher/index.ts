// The project switcher: a button naming the project a person is in, and the sheet
// it opens to change it, start a new one, or go to FluxIQ's list of all of them.
// Vanilla DOM in the chat's style (`project-switcher.css`, imported by chat.css),
// behind the one port a client supplies (`projects-port.ts`).
export { createProjectSwitcher, type ProjectSwitcher, type ProjectSwitcherOptions } from "./project-switcher.ts";
export { filterProjects } from "./filter-projects.ts";
export type { ProjectSummary } from "./project-summary.ts";
export type { ProjectsPort } from "./projects-port.ts";
