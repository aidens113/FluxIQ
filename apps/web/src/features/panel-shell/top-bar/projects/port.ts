import type { ProjectsPort } from "@fluxiq/ui-components";
import type { SharedSource } from "../../shared";
import type { ProjectChoice } from "./choice";
import type { ProjectsReading } from "./reading";

/**
 * The shared switcher's port over the shell's one projects source: `list` reads that source again and
 * answers with the reading it ends on (so the shell still asks `projects` once, through one path), and
 * `create` goes through `make`, then tells the source so every reader of the list sees the new project.
 */
export function createProjectsPort(
  source: SharedSource<ProjectsReading>,
  make: (name: string) => Promise<ProjectChoice>,
  changed: () => void
): Required<ProjectsPort> {
  return {
    list: () =>
      new Promise((resolve, reject) => {
        const stop = source.subscribe(() => {
          stop();
          const reading = source.getSnapshot();
          if (reading.failed && reading.projects.length === 0) reject(new Error("Couldn't load your projects."));
          else resolve([...reading.projects]);
        });
        source.refresh();
      }),
    create: async (name) => {
      const made = await make(name);
      changed();
      return made;
    }
  };
}
