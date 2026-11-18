"use client";

import { useSyncExternalStore } from "react";
import { useProgramTransport } from "../../automation-studio/data/use-program-transport";
import { PROJECTS_NOT_READ, type ProjectsReading, projectsSource, projectsTransport } from "./projects";

/** The projects the person can see. Every component shares one reading, so the shell asks once. Empty until it answers. */
export function useProjectChoices(): ProjectsReading {
  projectsTransport.current = useProgramTransport("automation-studio");
  return useSyncExternalStore(projectsSource.subscribe, projectsSource.getSnapshot, () => PROJECTS_NOT_READ);
}
