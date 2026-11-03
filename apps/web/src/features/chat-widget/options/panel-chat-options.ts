// How this panel mounts the chat: the options the Studio's window and the
// chat-alone route share, so the two never differ in what the chat can do.
// Only what each surface owns is passed in (the ports, which thread the host
// restores, and who hears the chat's name and how many threads wait).

import type { ChatAskPort, ChatAttachmentPort, ChatOpenControlFactory, ChatThreadsOptions, ChatWidgetOptions } from "@fluxiq/ui-components";
import { CONVERSATION_TEXT_MAX } from "../../automation-studio/conversation";
import { formatRuntimeTimestamp } from "../../automation-studio/runtime";
import { PANEL_CHAT_WELCOME } from "./welcome";

const NO_PROJECT = "Open a project to start a conversation. FluxIQ also opens a thread by itself as soon as a run, a build or a Flow has something to say.";

export type PanelChatOptionsInput = {
  asks: ChatAskPort;
  attachments: ChatAttachmentPort;
  openControl: ChatOpenControlFactory;
  threads: Omit<ChatThreadsOptions, "unavailableReason">;
};

/** The chat's options for this panel, without the owner key (the mount knows the project). */
export function panelChatOptions(input: PanelChatOptionsInput): Omit<ChatWidgetOptions, "ownerKey"> {
  return {
    threads: { ...input.threads, unavailableReason: NO_PROJECT },
    asks: input.asks,
    attachments: input.attachments,
    openControl: input.openControl,
    welcome: PANEL_CHAT_WELCOME,
    fallback: {
      title: "Sign in again to keep chatting.",
      line: "FluxIQ has signed you out of this panel. Sign in again, then open the conversation."
    },
    history: { window: 200 },
    turnMeta: { formatTime: formatRuntimeTimestamp },
    pendingBanner: true,
    // The window or the page already names the project, so the chat does not say it twice.
    contextLine: false,
    composer: {
      maxLength: CONVERSATION_TEXT_MAX,
      remainingHintBelow: 500,
      keepDraft: false,
      sendHint: "Send (Enter). Shift and Enter start a new line."
    }
  };
}
