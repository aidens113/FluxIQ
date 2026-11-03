"use client";

// The chat alone, filling the window: no settings beside it, no split screen.
// It is the same chat as the Studio's window, with the same options, and draws
// its own heading because no window bar carries the name.

import { ProgramChatWidget } from "./ProgramChatWidget";

export function ChatWidgetPage(props: { projectId: string }) {
  return <main className="chat-widget-page" aria-label="FluxIQ chat"><ProgramChatWidget projectId={props.projectId} /></main>;
}
