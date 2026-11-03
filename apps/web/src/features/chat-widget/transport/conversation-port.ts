// The chat's conversation over Core's conversation endpoints, as the Studio's
// own conversation view reaches them (`automation-studio/conversation/`).
//
//   listThreads  `list-conversations`; the project's own thread is asked for
//                by its subject (`project`, with the project's id as the id)
//   readThread   `get-conversation`, forward from `sinceTurnId`
//   send         into a thread: `append-turn` as an instruction
//                (`sendConversationInstruction`: the panel's capability
//                vocabulary and what is on screen, so Core runs what a person
//                asked for and not only stores it). With no thread yet,
//                `open-conversation` first (Core continues the subject's open
//                thread when there is one), then the same
//   answer       `answer-ask`, flat as Core's handler reads it

import type { ChatConversationPort, ChatResult } from "@fluxiq/ui-components";
import { sendConversationInstruction } from "../../automation-studio/conversation";
import type { ProgramCommandTransport } from "../../automation-studio/data/program-transport";
import { chatResult } from "./chat-result";
import type { ProgramChatTransportOptions } from "./options";
import { projectFor } from "./project-for";

const NO_MESSAGE = "There is no message to send.";
const OPENED_NOTHING = "FluxIQ opened a conversation but did not say which one.";

export function createConversationPort(api: ProgramCommandTransport, options: Pick<ProgramChatTransportOptions, "projectId">): ChatConversationPort {
  return {
    async listThreads(query) {
      const project = projectFor(query.projectId, options);
      if (!project.ok) return project.failure;
      const subjectId = query.subjectId ?? (query.subjectKind === "project" ? project.projectId : undefined);
      return chatResult(await api.post<{ conversations?: unknown }>("list-conversations", {
        projectId: project.projectId,
        status: query.status,
        subjectKind: query.subjectKind,
        ...(subjectId === undefined ? {} : { subjectId }),
        limit: query.limit
      }));
    },

    async readThread(query) {
      const project = projectFor(query.projectId, options);
      if (!project.ok) return project.failure;
      return chatResult(await api.post<{ conversation?: unknown }>("get-conversation", {
        projectId: project.projectId,
        conversationId: query.conversationId,
        ...(query.sinceTurnId === undefined ? {} : { sinceTurnId: query.sinceTurnId }),
        limit: query.limit
      }));
    },

    async send(message) {
      const project = projectFor(message.projectId, options);
      if (!project.ok) return project.failure;
      const text = message.text.trim();
      if (!text) return { ok: false, code: "invalid_request", sentence: NO_MESSAGE };

      let conversationId = message.conversationId?.trim() || undefined;
      let opened: unknown;
      if (conversationId === undefined) {
        const subjectKind = message.subjectKind ?? "project";
        const subjectId = message.subjectId ?? (subjectKind === "project" ? project.projectId : undefined);
        const started = chatResult(await api.post<{ conversation?: unknown }>("open-conversation", {
          projectId: project.projectId,
          subjectKind,
          ...(subjectId === undefined ? {} : { subjectId }),
          ...(message.title ? { title: message.title } : {})
        }));
        if (!started.ok) return started;
        opened = (started.value as { conversation?: unknown }).conversation;
        conversationId = recordId(opened);
        if (conversationId === undefined) return { ok: false, code: "failed", sentence: OPENED_NOTHING };
      }

      const sent = await sendConversationInstruction(api, {
        projectId: project.projectId,
        conversationId,
        text,
        ...(message.onScreen ? { onScreen: message.onScreen } : {})
      });
      if (!sent.ok) {
        const sentence = sent.error ?? "The message could not be sent.";
        return { ok: false, code: "failed", sentence, detail: sentence };
      }
      return { ok: true, value: opened === undefined ? {} : { conversation: opened } };
    },

    async answer(answer): Promise<ChatResult<unknown>> {
      const project = projectFor(answer.projectId, options);
      if (!project.ok) return project.failure;
      return chatResult(await api.post("answer-ask", {
        projectId: project.projectId,
        askId: answer.askId,
        kind: answer.kind,
        ...(typeof answer.value === "string" ? { value: answer.value } : {})
      }));
    }
  };
}

function recordId(conversation: unknown): string | undefined {
  const id = conversation && typeof conversation === "object" ? (conversation as { conversationId?: unknown }).conversationId : undefined;
  return typeof id === "string" && id.trim() ? id.trim() : undefined;
}
