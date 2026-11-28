// What the project switcher asks of the client's connection to FluxIQ.

import type { ProjectSummary } from "./project-summary.ts";

/**
 * Lists the projects a person may switch to and, where the client may, makes a new one. `create` is absent in a
 * client that only shows the work (the extension): FluxIQ makes the first project on the first message and the panel
 * adds more, so the switcher draws no "New project" and points to the panel. Either call may
 * reject; the switcher says so in words and never throws. `create` rejects with an
 * `Error` whose message is a sentence a person can read, and the switcher shows it.
 */
export type ProjectsPort = {
  list(): Promise<ProjectSummary[]>;
  create?(name: string): Promise<ProjectSummary>;
};
