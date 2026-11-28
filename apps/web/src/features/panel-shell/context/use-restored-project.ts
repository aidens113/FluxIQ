"use client";

// The person's current project is one value in Core, shared with every client (`core-context.ts`).
//
// On load the panel adopts it: `?project=` in the address wins, then Core's current project, then what
// this browser remembered, which is only the fallback for a Core that could not be read or holds none
// (after a restart Core holds none until someone picks). A project the person picked before Core
// answered is never overridden. From then on every switch is written to Core, and so is the Flow a
// page opens; leaving a Flow's page writes nothing, so the Flow a client has open stays until another
// is opened or the project changes. When a client switches the person's project, the panel's change stream
// says so (`context`) and the panel reads Core again and follows, without a tab focus or a timer; it reads
// again too whenever the stream opens, since a switch may have come while it was down.
//
// A restored project the panel's own list does not know is dropped without an error. Only the restored
// id is checked, so a project the person has just created is never cleared by a list that has not caught
// up yet, and a failed list read proves nothing. A project dropped that way that came from Core is not
// cleared in Core: another client may see it where this page cannot.

import { useEffect, useRef, useState, type Dispatch } from "react";
import type { PanelChangesPort } from "../../panel-changes";
import { useProjectChoices } from "../top-bar/use-project-choices";
import type { PanelContextAction } from "./action";
import type { CoreContextPort, CoreContextValue } from "./core-context";
import { readStoredProject, storeProject } from "./project-storage";
import { requestedProject } from "./requested-project";

type Restored = { id: string; from: "address" | "core" | "stored" };

export function useRestoredProject(projectId: string | undefined, flowId: string | undefined, dispatch: Dispatch<PanelContextAction>, core: CoreContextPort, changes: PanelChangesPort): void {
  const reading = useProjectChoices();
  const restored = useRef<Restored | undefined>(undefined);
  const chosen = useRef(false);
  const current = useRef(projectId);
  current.current = projectId;
  // What Core holds as far as this page knows: a switch is written only when it differs.
  const known = useRef<CoreContextValue | undefined>(undefined);
  // Set while a project Core holds is dropped here because this page cannot see it: Core keeps it.
  const keepInCore = useRef(false);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    let live = true;
    const fromAddress = requestedProject(typeof window === "undefined" ? undefined : window.location.search);
    if (fromAddress !== undefined) {
      restored.current = { id: fromAddress, from: "address" };
      dispatch({ type: "project", projectId: fromAddress });
      setSettled(true);
      return;
    }
    void core.read().then((read) => {
      if (!live) return;
      // Core unread is not "Core holds none": what this page knows of Core stays unknown, and the remembered project is used.
      if (!read.ok) console.warn(read.reason);
      const value = read.ok ? read.value : undefined;
      known.current = value;
      // Something on the page (a chat's own address, the person) already chose: that stands.
      if (current.current === undefined) {
        const stored = readStoredProject();
        const pick: Restored | undefined = value?.projectId !== undefined ? { id: value.projectId, from: "core" } : stored.ok && stored.value !== undefined ? { id: stored.value, from: "stored" } : undefined;
        if (pick) {
          restored.current = pick;
          dispatch({ type: "project", projectId: pick.id });
        }
      }
      setSettled(true);
    });
    return () => {
      live = false;
    };
  }, [core, dispatch]);

  useEffect(() => {
    const pick = restored.current;
    if (pick === undefined || pick.id !== projectId || !reading.loaded || reading.failed) return;
    restored.current = undefined;
    if (reading.projects.some((project) => project.id === pick.id)) return;
    if (pick.from === "core") keepInCore.current = true;
    dispatch({ type: "project", projectId: undefined });
  }, [projectId, reading, dispatch]);

  useEffect(() => {
    if (!settled) return;
    if (keepInCore.current && projectId === undefined) {
      keepInCore.current = false;
      known.current = { projectId: undefined, flowId: undefined };
      return;
    }
    const last = known.current;
    const switched = projectId !== last?.projectId;
    const openedFlow = !switched && flowId !== undefined && flowId !== last?.flowId;
    if (!switched && !openedFlow) return;
    const next: CoreContextValue = { projectId, flowId: projectId === undefined ? undefined : flowId };
    known.current = next;
    void core.write(next).then((written) => {
      if (!written.ok) console.warn(written.reason);
    });
  }, [settled, projectId, flowId, core]);

  useEffect(() => {
    if (!settled) return;
    let live = true;
    const follow = () => {
      void core.read().then((read) => {
        if (!live) return;
        if (!read.ok) {
          console.warn(read.reason);
          return;
        }
        if (read.value.projectId === undefined || read.value.projectId === current.current) return;
        known.current = read.value;
        dispatch({ type: "project", projectId: read.value.projectId });
      });
    };
    const stop = changes.subscribe({ context: follow, opened: follow });
    return () => {
      live = false;
      stop();
    };
  }, [settled, core, dispatch, changes]);

  useEffect(() => {
    // Nothing chosen yet is the empty state before the restore: it must not wipe what was remembered.
    if (projectId !== undefined) chosen.current = true;
    else if (!chosen.current) return;
    const stored = storeProject(projectId);
    if (!stored.ok) console.warn(stored.reason);
  }, [projectId]);
}
