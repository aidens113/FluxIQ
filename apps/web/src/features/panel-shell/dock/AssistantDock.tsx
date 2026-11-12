"use client";

// The assistant on the right of every panel page: the chat's shared widget over
// the panel-wide thread. On a wide screen it is a column beside the page; on a
// phone it is a full-height sheet behind a round button. It follows the project the top bar names, since a
// conversation needs one to start in. Closing it hides it
// without unmounting, so the thread and a half-typed message stay. A link
// ending in `?chat=open` (where the old chat page now redirects) opens it.

import { useCallback, useEffect, useMemo, useState } from "react";
import { ProgramChatWidget } from "../../chat-widget";
import { onScreenFromContext, usePanelContext } from "../context";
import { useProjectChoices } from "../top-bar";
import { openProjectName } from "./open-project-name";

export function AssistantDock() {
  const { context, read } = usePanelContext();
  const [open, setOpen] = useState(false);
  const { projects } = useProjectChoices();
  const projectName = openProjectName(projects, context.projectId);
  const panel = useMemo(() => ({ onScreen: () => onScreenFromContext(read()) }), [read]);
  const toggle = useCallback(() => setOpen((was) => !was), []);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("chat") === "open") setOpen(true);
  }, []);
  return (
    <>
      <aside className="panel-dock" data-open={open} aria-label="Assistant">
        <div className="panel-dock-bar">
          <strong>Assistant</strong>
          <span className="panel-dock-where">{pageWords(context.page)}</span>
          <button type="button" className="panel-dock-close" onClick={toggle} aria-label="Close the assistant">Close</button>
        </div>
        <div className="panel-dock-body">
          <ProgramChatWidget projectId={context.projectId ?? null} projectName={projectName} panel={panel} />
        </div>
      </aside>
      <button
        type="button"
        className="panel-dock-button"
        aria-label={open ? "Close the assistant" : "Open the assistant"}
        aria-expanded={open}
        onClick={toggle}
      >
        {open ? "×" : "Ask"}
      </button>
    </>
  );
}

function pageWords(page: string): string {
  return `On ${page.charAt(0).toUpperCase()}${page.slice(1)}`;
}
