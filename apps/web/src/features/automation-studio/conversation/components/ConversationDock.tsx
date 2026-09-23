"use client";

// The chat window as an overlay over the whole workspace.
//
// It was a thirteenth Studio view in the right-hand region, and the person who
// asked for it could only find it "after manually digging around for it". That
// is the wrong shape for this surface: it is not one inspector among twelve,
// it is the product's general channel to the person, so it has to be in front
// of whatever they are looking at and reachable without navigating anywhere.
//
// Three things follow from that, and each is load-bearing:
//
// 1. **The launcher is always on screen.** Fixed to the corner, over every
//    region, with a badge when a thread is holding a question. Someone who has
//    never opened it still gets told when FluxIQ needs them.
// 2. **Collapsed, not unmounted.** The panel keeps its DOM and its poller when
//    it is closed, because the badge is the only thing that can tell a person a
//    question arrived, and a surface that stops reading when it is closed can
//    never light it. Closing is cheap and reopening keeps the thread and the
//    scroll position.
// 3. **Escape closes it and focus comes back.** It floats over the workspace
//    without trapping anyone in it.

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Maximize2, MessagesSquare, Minimize2 } from "lucide-react";
import type { ConversationViewHostCommands } from "../conversation-host";
import { ConversationView } from "./ConversationView";

export type ConversationDockProps = ConversationViewHostCommands & {
  /** The project whose threads are shown, or null for every project the person can see. */
  projectId: string | null;
};

export function ConversationDock(props: ConversationDockProps) {
  const [open, setOpen] = useState(false);
  const [wide, setWide] = useState(false);
  const [waiting, setWaiting] = useState(0);
  const launcherRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();

  const close = useCallback(() => {
    setOpen(false);
    launcherRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // A re-authorization dialog opened from inside the thread portals to the
      // body and takes Escape for itself. Collapsing the dock underneath it
      // would cancel the answer and hide the question in one keystroke.
      if (document.querySelector('[data-overlay-root="modal"]')) return;
      close();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [close, open]);

  const onWaitingChange = useCallback((next: number) => setWaiting(next), []);

  return (
    <div className="automation-conversation-dock" data-open={open ? "true" : "false"}>
      <div
        aria-label="FluxIQ conversation"
        className={`automation-conversation-dock-panel${wide ? " wide" : ""}`}
        hidden={!open}
        id={panelId}
        ref={panelRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="automation-conversation-dock-bar">
          <MessagesSquare aria-hidden size={15} />
          <strong>FluxIQ</strong>
          <button
            aria-label={wide ? "Make the conversation narrower" : "Make the conversation wider"}
            className="automation-conversation-dock-icon"
            onClick={() => setWide((current) => !current)}
            title={wide ? "Narrower" : "Wider"}
            type="button"
          >
            {wide ? <Minimize2 aria-hidden size={14} /> : <Maximize2 aria-hidden size={14} />}
          </button>
          <button
            aria-label="Collapse the conversation"
            className="automation-conversation-dock-icon"
            onClick={close}
            title="Collapse (Esc)"
            type="button"
          >
            <ChevronDown aria-hidden size={16} />
          </button>
        </header>
        <ConversationView
          active={open}
          projectId={props.projectId}
          onWaitingChange={onWaitingChange}
          {...(props.onOpenAttachment ? { onOpenAttachment: props.onOpenAttachment } : {})}
          {...(props.onSelectedConversationChange ? { onSelectedConversationChange: props.onSelectedConversationChange } : {})}
        />
      </div>
      <button
        aria-controls={panelId}
        aria-expanded={open}
        aria-label={conversationLauncherLabel(open, waiting)}
        className="automation-conversation-dock-launcher"
        data-waiting={waiting > 0 ? "true" : "false"}
        onClick={() => (open ? close() : setOpen(true))}
        ref={launcherRef}
        title={conversationLauncherLabel(open, waiting)}
        type="button"
      >
        <MessagesSquare aria-hidden size={17} />
        <span>{waiting > 0 ? "Needs you" : "FluxIQ"}</span>
        {waiting > 0 ? <span className="automation-conversation-dock-badge">{waiting}</span> : null}
      </button>
    </div>
  );
}

/** What the launcher says it will do, and what is waiting behind it. */
export function conversationLauncherLabel(open: boolean, waiting: number): string {
  const state = open ? "Collapse the FluxIQ conversation" : "Open the FluxIQ conversation";
  if (waiting === 1) return `${state} - 1 thread is waiting on your answer`;
  if (waiting > 1) return `${state} - ${waiting} threads are waiting on your answer`;
  return state;
}
