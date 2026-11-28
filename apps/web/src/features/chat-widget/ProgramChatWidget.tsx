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
import { AI_KEYS_HREF, ASSISTANT_MODEL_HREF, createPanelModelKeysPort } from "../model-keys";
import { createPanelAskPort } from "./asks";
import { createPanelAttachmentPort, readAttachment } from "./attachments";
import { ChatWidget } from "./ChatWidget";
import { createPanelOpenControl } from "./navigation";
import { panelChatOptions } from "./options";
import { ReauthorizeDialog } from "./ReauthorizeDialog";
import { askFirstProject, createProgramChatTransport, type PanelConversationOptions } from "./transport";

/** The project id an earlier chat with no project reads back with (Core's panel threads). */
const EARLIER_CHAT_PROJECT = "panel";

export type ProgramChatWidgetProps = {
  /** The project the panel has open; null when none is, and the chat then lists every project's chats. */
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
  /**
   * Present: the chat is the panel's docked chat. With no project open it starts in the person's own project
   * (Core's first-project), and the person's earlier chats with no project are listed beside the project's.
   * Read when the chat is made.
   */
  panel?: PanelConversationOptions;
  /** Hears the project a chat with none open was just started in, so the panel can open it. */
  onProjectFound?(projectId: string): void;
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

  // The key card the dock's empty state shows reads Core's real key state through this port.
  const modelKeys = useMemo(() => createPanelModelKeysPort(secretKeys), [secretKeys]);
  const transport = useMemo(() => createProgramChatTransport(studio, {
    projectId: () => shown.current ?? latest.current.projectId ?? undefined,
    secretKeys,
    modelKeys,
    onScreen: () => latest.current.onScreen ?? {},
    // Whether this is the docked chat is fixed when it is made. With no project open its first message or
    // New chat starts in the person's own project; the panel is told after the chat's own answer has landed,
    // since opening the project there gives the chat a new owner.
    ...(latest.current.panel ? { personProject: {
      find: askFirstProject,
      found: (projectId: string) => {
        shown.current = projectId;
        setTimeout(() => latest.current.onProjectFound?.(projectId), 0);
      }
    } } : {}),
    ...(latest.current.panel ? { panel: {
      onScreen: () => latest.current.panel?.onScreen() ?? {},
      openProject: () => {
        const projectId = latest.current.projectId;
        return projectId ? { projectId, name: latest.current.projectName ?? undefined } : undefined;
      }
    } } : {})
  }), [studio, secretKeys, modelKeys]);

  // The chat reads its options once, when it is made; a later change of the requested thread is not a new chat.
  const requestedConversationId = useRef(props.requestedConversationId).current;
  const options = useMemo(() => panelChatOptions({
    personProject: latest.current.panel !== undefined,
    asks: createPanelAskPort(setRequest),
    attachments: createPanelAttachmentPort({
      read: readAttachment(studio, latest.current.panel ? { panel: { openProjectId: () => latest.current.projectId ?? undefined } } : {}),
      open: (attachment: ChatAttachment) => latest.current.onOpenAttachment?.(attachment),
      canOpen: () => latest.current.onOpenAttachment !== undefined
    }),
    openControl: createPanelOpenControl((href) => routerRef.current.push(href)),
    onModelKeyAction: (action) => routerRef.current.push(action === "change-model" ? ASSISTANT_MODEL_HREF : AI_KEYS_HREF),
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
        onTarget={(target) => {
          // An earlier chat with no project reads back as the reserved `panel`, which names no project to start in.
          shown.current = target.projectId === EARLIER_CHAT_PROJECT ? undefined : target.projectId;
          // Another thread may be another project's: its live activity is read now, not on the next change.
          transport.activity.followProject();
        }}
      />
      {request ? <ReauthorizeDialog key={request.title + request.actionLabel} request={request} onClose={() => setRequest(null)} /> : null}
    </>
  );
}
