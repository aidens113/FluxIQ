"use client";

import { useEffect, useState } from "react";
import { useProgramTransport } from "../../automation-studio/data/use-program-transport";

export type ProjectChoice = { id: string; name: string };

/** The projects the person can see, from the Studio's `projects` endpoint. Empty until it answers. */
export function useProjectChoices(): { projects: ProjectChoice[]; failed: boolean } {
  const studio = useProgramTransport("automation-studio");
  const [state, setState] = useState<{ projects: ProjectChoice[]; failed: boolean }>({ projects: [], failed: false });
  useEffect(() => {
    const controller = new AbortController();
    void studio.get<{ projects?: Array<{ id?: unknown; name?: unknown }> }>("projects", { signal: controller.signal }).then((response) => {
      if (response.aborted || controller.signal.aborted) return;
      if (!response.ok) return setState({ projects: [], failed: true });
      const projects = (response.payload?.projects ?? []).flatMap((project) =>
        typeof project.id === "string" && project.id
          ? [{ id: project.id, name: typeof project.name === "string" && project.name ? project.name : project.id }]
          : []);
      setState({ projects, failed: false });
    });
    return () => controller.abort();
  }, [studio]);
  return state;
}
