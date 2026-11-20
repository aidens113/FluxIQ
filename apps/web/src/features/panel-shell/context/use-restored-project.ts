"use client";

// The project survives a reload: restored once on mount (from `?project=`, else what this browser
// remembered), remembered again at each change, and dropped without an error when the panel's own project
// list says the restored one is unknown. Only the restored id is checked, so a project the person has just
// created is never cleared by a list that has not caught up yet. A failed list read proves nothing.

import { useEffect, useRef, type Dispatch } from "react";
import { useProjectChoices } from "../top-bar/use-project-choices";
import type { PanelContextAction } from "./action";
import { storeProject } from "./project-storage";
import { requestedProject } from "./requested-project";

export function useRestoredProject(projectId: string | undefined, dispatch: Dispatch<PanelContextAction>): void {
  const reading = useProjectChoices();
  const restored = useRef<string | undefined>(undefined);
  const chosen = useRef(false);

  useEffect(() => {
    const wanted = requestedProject(typeof window === "undefined" ? undefined : window.location.search);
    if (wanted === undefined) return;
    restored.current = wanted;
    dispatch({ type: "project", projectId: wanted });
  }, [dispatch]);

  useEffect(() => {
    const id = restored.current;
    if (id === undefined || id !== projectId || !reading.loaded || reading.failed) return;
    restored.current = undefined;
    if (!reading.projects.some((project) => project.id === id)) dispatch({ type: "project", projectId: undefined });
  }, [projectId, reading, dispatch]);

  useEffect(() => {
    // Nothing chosen yet is the empty state before the restore: it must not wipe what was remembered.
    if (projectId !== undefined) chosen.current = true;
    else if (!chosen.current) return;
    const stored = storeProject(projectId);
    if (!stored.ok) console.warn(stored.reason);
  }, [projectId]);
}
