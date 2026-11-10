"use client";

// The chat as a window over the whole workspace: a launcher that is always on
// screen, with a badge when a thread is holding a question, and the chat in a
// panel above it. The window and the chat are the package's
// (`createChatWindow`, `createChatWidget`); this only mounts them with the
// panel's ports and options (`ProgramChatWidget`).
//
// Escape closes the window, except while a dialog is over it: a PIN dialog
// opened from a question portals to the body and takes Escape for itself, and
// collapsing the window beneath it would cancel the answer and hide the
// question in one key.

import type { ChatAttachment } from "@fluxiq/ui-components";
import type { PanelConversationOptions } from "./transport";
import type { ConversationOnScreen } from "../automation-studio/conversation";
import { ProgramChatWidget } from "./ProgramChatWidget";

export type ChatDockProps = {
  /** The project whose threads are shown, or null for every project the person can see. */
  projectId: string | null;
  projectName?: string;
  /** What the panel has open, so "run it" means the Flow on screen. */
  onScreen?: ConversationOnScreen;
  /** Present: the window is the panel-wide assistant. */
  panel?: PanelConversationOptions;
  onOpenAttachment?(attachment: ChatAttachment): void;
  onSelectedConversationChange?(conversationId: string): void;
  /** Restored by whatever mounted the dock, so it reopens on the same thread. */
  requestedConversationId?: string;
};

function modalIsOpen(): boolean {
  return typeof document !== "undefined" && document.querySelector('[data-overlay-root="modal"]') !== null;
}

const WINDOW = { ariaLabel: "FluxIQ conversation", escapeBlocked: modalIsOpen };

export function ChatDock(props: ChatDockProps) {
  return <ProgramChatWidget {...props} windowed={WINDOW} />;
}
