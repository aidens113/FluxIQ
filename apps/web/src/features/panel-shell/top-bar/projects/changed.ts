export const PROJECTS_CHANGED_EVENT = "fluxiq:projects-changed";

/** Tells the shell a project was created, renamed or removed, so the one shared list reads again. */
export function notifyProjectsChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(PROJECTS_CHANGED_EVENT));
}
