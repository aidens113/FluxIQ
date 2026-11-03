"use client";

// The chat alone, filling the window: no settings beside it, no split screen.

import { ProgramChatWidget } from "./ProgramChatWidget";

export function ChatWidgetPage(props: { projectId: string }) {
  return <main className="chat-widget-page" aria-label="FluxIQ chat"><ProgramChatWidget projectId={props.projectId} /></main>;
}
