// The panel-wide thread's conversation, over the assistant's own endpoints
// (`list-panel-threads`, `get-panel-thread`, `send-panel-message`,
// `answer-panel-ask`, and `open-panel-thread`, `rename-panel-thread` and `delete-panel-thread` for the list's controls). Only the transport's panel branch uses it; project
// threads keep `conversation-port.ts` and its endpoints.
//
// A panel thread belongs to no project, so no request names one. Every send
// carries what the person has open (`onScreen.page` and `onScreen.selection`),
// asked at the send so it is what is on screen then. Core runs the work in the
// background; its steps, reply and Allow cards appear as turns on the next read.

import type { ChatConversationPort, ChatOnScreen } from "@fluxiq/ui-components";
import type { ProgramCommandTransport } from "../../automation-studio/data/program-transport";
import { chatFailure } from "./chat-failure";
import { chatResult } from "./chat-result";

const NO_MESSAGE = "There is no message to send.";
const NO_TITLE = "A chat needs a name.";

export type PanelConversationOptions = {
  /** The page and selection the person has open now. */
  onScreen(): ChatOnScreen;
};

export function createPanelConversationPort(api: ProgramCommandTransport, options: PanelConversationOptions): ChatConversationPort {
  const list = async (limit: number) => chatResult<{ conversations?: unknown }>(await api.post<{ conversations?: unknown }>("list-panel-threads", { limit }));
  return {
    listThreads: (query) => list(query.limit),
    listAllThreads: (query) => list(query.limit),

    async readThread(query) {
      return chatResult(await api.post<{ conversation?: unknown }>("get-panel-thread", {
        conversationId: query.conversationId,
        ...(query.sinceTurnId === undefined ? {} : { sinceTurnId: query.sinceTurnId }),
        limit: query.limit
      }));
    },

    async send(message) {
      const text = message.text.trim();
      if (!text) return { ok: false, code: "invalid_request", sentence: NO_MESSAGE };
      const conversationId = message.conversationId?.trim() || undefined;
      // What the panel has open wins over what the chat guessed: it is what the person is looking at.
      const onScreen = { ...message.onScreen, ...options.onScreen() };
      const sent = await api.post<{ conversation?: unknown }>("send-panel-message", {
        text,
        ...(conversationId === undefined ? {} : { conversationId }),
        ...(conversationId === undefined && message.title ? { title: message.title } : {}),
        ...(Object.keys(onScreen).length ? { onScreen } : {})
      });
      if (!sent.ok) return chatFailure(sent);
      const conversation = sent.payload?.conversation;
      return { ok: true, value: conversation === undefined ? {} : { conversation } };
    },

    async newThread(request) {
      return chatResult(await api.post<{ conversation?: unknown }>("open-panel-thread", request.title ? { title: request.title } : {}));
    },

    async renameThread(request) {
      const title = request.title.trim();
      if (!title) return { ok: false, code: "invalid_request", sentence: NO_TITLE };
      return chatResult(await api.post<{ conversation?: unknown }>("rename-panel-thread", { conversationId: request.conversationId, title }));
    },

    // Core refuses a thread whose message is still being worked on, in its own sentence, which passes through.
    async deleteThread(request) {
      return chatResult(await api.post<{ deleted?: boolean }>("delete-panel-thread", { conversationId: request.conversationId }));
    },

    async answer(answer) {
      const onScreen = options.onScreen();
      return chatResult(await api.post("answer-panel-ask", {
        askId: answer.askId,
        kind: answer.kind,
        ...(Object.keys(onScreen).length ? { onScreen } : {})
      }));
    }
  };
}
