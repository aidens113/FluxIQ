"use client";

import { useCallback, useEffect, useState } from "react";
import { useProgramTransport } from "../data/use-program-transport";

export type ListedProject = { id: string; name: string };

export type ProjectList =
  | { state: "loading"; reload(): void }
  | { state: "error"; message: string; reload(): void }
  | { state: "ready"; projects: ListedProject[]; reload(): void; add(project: ListedProject): void };

/** The projects the person can see, from the Studio's `projects` endpoint, with loading, failure and a reload. */
export function useProjectList(): ProjectList {
  const studio = useProgramTransport("automation-studio");
  const [round, setRound] = useState(0);
  const [loaded, setLoaded] = useState<{ state: "loading" } | { state: "error"; message: string } | { state: "ready"; projects: ListedProject[] }>({ state: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    setLoaded({ state: "loading" });
    void studio.get<{ projects?: Array<{ id?: unknown; name?: unknown }> }>("projects", { signal: controller.signal }).then((response) => {
      if (response.aborted || controller.signal.aborted) return;
      if (!response.ok) return setLoaded({ state: "error", message: response.error ?? "The projects could not be loaded." });
      const projects = (response.payload?.projects ?? []).flatMap((project) =>
        typeof project.id === "string" && project.id
          ? [{ id: project.id, name: typeof project.name === "string" && project.name ? project.name : project.id }]
          : []);
      setLoaded({ state: "ready", projects });
    });
    return () => controller.abort();
  }, [studio, round]);
  const reload = useCallback(() => setRound((value) => value + 1), []);
  const add = useCallback((project: ListedProject) => setLoaded((was) => was.state === "ready" ? { state: "ready", projects: [project, ...was.projects.filter((item) => item.id !== project.id)] } : was), []);
  return loaded.state === "ready" ? { ...loaded, reload, add } : { ...loaded, reload };
}
