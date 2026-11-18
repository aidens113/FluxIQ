// What the project switcher asks of the client's connection to FluxIQ.

import type { ProjectSummary } from "./project-summary.ts";

/**
 * Lists the projects a person may switch to and makes a new one. Either call may
 * reject; the switcher says so in words and never throws. `create` rejects with an
 * `Error` whose message is a sentence a person can read, and the switcher shows it.
 */
export type ProjectsPort = {
  list(): Promise<ProjectSummary[]>;
  create(name: string): Promise<ProjectSummary>;
};
