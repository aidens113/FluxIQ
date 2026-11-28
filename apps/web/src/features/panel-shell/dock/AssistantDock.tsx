"use client";

// The chat on the right of every panel page: the chat's shared widget, the same chat the extension shows.
// Every chat belongs to a project: the dock works in the project the top bar names, and with none open a
// first message or New chat starts in the person's own project (Core's first-project, as the extension
// does), which the panel then opens, so the top bar, Core and every client agree on it. The person's
// earlier chats from before every chat had a project are listed after the project's and open where they
// live.
//
// On a wide screen it is a column beside the page; on a phone it is a full-height sheet behind a round
// button. The chat mounts at once when the dock is a column beside the page, otherwise on the first open, so
// a dock never opened costs nothing; closing it afterwards hides it without unmounting, so the thread and a
// half-typed message stay. A link ending in `?chat=open` (where the old chat page now redirects) opens it.

import { useCallback, useEffect, useMemo, useState } from "react";
import { ProgramChatWidget } from "../../chat-widget";
import { onScreenFromContext, usePanelContext } from "../context";
import { useProjectChoices } from "../top-bar";
import { openProjectName } from "./open-project-name";
import { useDockedBesidePage } from "./use-docked-beside-page";

export function AssistantDock() {
  const { context, read, dispatch } = usePanelContext();
  const [open, setOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
  const beside = useDockedBesidePage();
  const { projects } = useProjectChoices();
  const projectName = openProjectName(projects, context.projectId);
  const panel = useMemo(() => ({ onScreen: () => onScreenFromContext(read()) }), [read]);
  const toggle = useCallback(() => setOpen((was) => !was), []);
  // A chat started with no project open went into the person's project: that is the open project now.
  const projectFound = useCallback((projectId: string) => {
    if (read().projectId === undefined) dispatch({ type: "project", projectId });
  }, [read, dispatch]);
  useEffect(() => {
    if (open) setEverOpened(true);
  }, [open]);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("chat") === "open") setOpen(true);
  }, []);
  return (
    <>
      <aside className="panel-dock" data-panel-dock="" data-open={open} aria-label="Chat">
        <div className="panel-dock-bar">
          <strong>Chat</strong>
          <span className="panel-dock-where">{pageWords(context.page)}</span>
          <button type="button" className="panel-dock-close" onClick={toggle} aria-label="Close the chat">Close</button>
        </div>
        <div className="panel-dock-body">
          {open || everOpened || beside ? <ProgramChatWidget projectId={context.projectId ?? null} projectName={projectName} panel={panel} onProjectFound={projectFound} /> : null}
        </div>
      </aside>
      <button
        type="button"
        className="panel-dock-button"
        data-panel-dock-opener=""
        aria-label={open ? "Close the chat" : "Open the chat"}
        aria-expanded={open}
        onClick={toggle}
      >
        {open ? "×" : "Chat"}
      </button>
    </>
  );
}

function pageWords(page: string): string {
  return `On ${page.charAt(0).toUpperCase()}${page.slice(1)}`;
}
