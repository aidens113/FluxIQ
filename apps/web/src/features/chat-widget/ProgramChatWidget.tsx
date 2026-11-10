"use client";

// The chat widget wired to this panel: Core's conversation endpoints through
// the Studio's program transport, the Secret Keys program for whether a model
// key is enabled (never a value), the panel's own words for questions and
// attachments, and the router for the screens the chat cannot finish a
// question on. Both the window over the Studio (`ChatDock`) and the chat-alone
// route (`ChatWidgetPage`) mount it here, so they never differ in what the chat
// can do.

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import type { ChatAttachment, ChatReauthorizeRequest } from "@fluxiq/ui-components";
import type { ConversationOnScreen } from "../automation-studio/conversation";
import { useProgramTransport } from "../automation-studio/data/use-program-transport";
import { createPanelAskPort } from "./asks";
import { createPanelAttachmentPort, readAttachment } from "./attachments";
import { ChatWidget } from "./ChatWidget";
import { createPanelOpenControl } from "./navigation";
import { panelChatOptions } from "./options";
import { ReauthorizeDialog } from "./ReauthorizeDialog";
import { createProgramChatTransport, type PanelConversationOptions } from "./transport";

export type ProgramChatWidgetProps = {
  /** The project the panel has open; null on the landing screen, where the chat spans every project. */
  projectId: string | null;
  projectName?: string | null;
  automation?: { flowId: string; name: string };
  /** What the panel has open, sent with every message so "run it" means the Flow on screen. */
  onScreen?: ConversationOnScreen;
  /** Goes to what a turn's attachment names. Absent: the chat shows the reference without an Open control. */
  onOpenAttachment?(attachment: ChatAttachment): void;
  /** Hears the thread the chat shows, so the panel can reopen on it. */
  onSelectedConversationChange?(conversationId: string): void;
  /** The thread to open on, when it is still listed. */
  requestedConversationId?: string;
  /** Present: the chat is the panel-wide assistant thread, not a project's. Read when the chat is made. */
  panel?: PanelConversationOptions;
  /** Puts the chat in a window over the panel. Absent: the chat fills its container. */
  windowed?: { ariaLabel: string; escapeBlocked(): boolean };
};

export function ProgramChatWidget(props: ProgramChatWidgetProps) {
  const studio = useProgramTransport("automation-studio");
  const secretKeys = useProgramTransport("secret-keys");
  const router = useRouter();
  const [request, setRequest] = useState<ChatReauthorizeRequest | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const routerRef = useRef(router);
  routerRef.current = router;
  // The project of the thread on screen, which may be any the person can see; the host's own when none is chosen.
  const shown = useRef<string | undefined>(undefined);

  const transport = useMemo(() => createProgramChatTransport(studio, {
    projectId: () => shown.current ?? latest.current.projectId ?? undefined,
    secretKeys,
    onScreen: () => latest.current.onScreen ?? {},
    // The panel-wide assistant talks to the panel's own endpoints; whether this chat is that one is fixed when it is made.
    ...(latest.current.panel ? { panel: { onScreen: () => latest.current.panel?.onScreen() ?? {} } } : {})
  }), [studio, secretKeys]);

  // The chat reads its options once, when it is made; a later change of the requested thread is not a new chat.
  const requestedConversationId = useRef(props.requestedConversationId).current;
  const options = useMemo(() => panelChatOptions({
    asks: createPanelAskPort(setRequest),
    attachments: createPanelAttachmentPort({
      read: readAttachment(studio),
      open: (attachment: ChatAttachment) => latest.current.onOpenAttachment?.(attachment),
      canOpen: () => latest.current.onOpenAttachment !== undefined
    }),
    openControl: createPanelOpenControl((href) => routerRef.current.push(href)),
    threads: {
      ...(requestedConversationId ? { initialConversationId: requestedConversationId } : {}),
      onSelected: (conversationId) => latest.current.onSelectedConversationChange?.(conversationId)
    }
  }), [studio, requestedConversationId]);

  return (
    <>
      <ChatWidget
        transport={transport}
        projectId={props.projectId}
        {...(props.projectName === undefined ? {} : { projectName: props.projectName })}
        {...(props.automation ? { automation: props.automation } : {})}
        options={options}
        {...(props.windowed ? { windowed: props.windowed } : {})}
        onTarget={(target) => { shown.current = target.projectId; }}
      />
      {request ? <ReauthorizeDialog key={request.title + request.actionLabel} request={request} onClose={() => setRequest(null)} /> : null}
    </>
  );
}
