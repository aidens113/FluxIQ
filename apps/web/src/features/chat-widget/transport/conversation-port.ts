// The chat's conversation over Core's conversation endpoints, as the Studio's
// own conversation view reached them.
//
//   listThreads     `list-conversations`; the project's own thread is asked for
//                   by its subject (`project`, with the project's id as the id).
//                   With no project at all there is nothing to list: an empty
//                   list, not a failure
//   listAllThreads  `list-conversations` for the thread list: one project's, or
//                   every project the person can see, whatever their status
//   readThread      `get-conversation`, forward from `sinceTurnId`
//   send            into a thread: `append-turn` as an instruction
//                   (`sendConversationInstruction`: the panel's capability
//                   vocabulary and what is on screen, so Core runs what a person
//                   asked for and not only stores it). With no thread yet,
//                   `open-conversation` first (Core continues the subject's open
//                   thread when there is one), then the same
//   answer          `answer-ask` (`answer-ask.ts`)
//   newThread, renameThread, deleteThread   the thread list's controls (`thread-changes.ts`)

import type { ChatConversationPort } from "@fluxiq/ui-components";
import { commitConversationChanged, sendConversationInstruction } from "../../automation-studio/conversation";
import type { ProgramCommandTransport } from "../../automation-studio/data/program-transport";
import { answerAsk } from "./answer-ask";
import { chatFailure } from "./chat-failure";
import { chatResult } from "./chat-result";
import type { ProgramChatTransportOptions } from "./options";
import { projectFor } from "./project-for";
import { createThreadChanges } from "./thread-changes";

const NO_MESSAGE = "There is no message to send.";
const OPENED_NOTHING = "FluxIQ opened a conversation but did not say which one.";

export function createConversationPort(api: ProgramCommandTransport, options: Pick<ProgramChatTransportOptions, "projectId" | "onScreen">): ChatConversationPort {
  return {
    async listThreads(query) {
      const project = projectFor(query.projectId, options);
      if (!project.ok) return { ok: true, value: { conversations: [] } };
      const subjectId = query.subjectId ?? (query.subjectKind === "project" ? project.projectId : undefined);
      return chatResult(await api.post<{ conversations?: unknown }>("list-conversations", {
        projectId: project.projectId,
        status: query.status,
        subjectKind: query.subjectKind,
        ...(subjectId === undefined ? {} : { subjectId }),
        limit: query.limit
      }));
    },

    async listAllThreads(query) {
      return chatResult(await api.post<{ conversations?: unknown }>("list-conversations", { projectId: query.projectId ?? null, limit: query.limit }));
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

      // What the host has open wins over what the chat guessed: it is what the person is looking at.
      const onScreen = { ...message.onScreen, ...options.onScreen?.() };
      const sent = await sendConversationInstruction(api, {
        projectId: project.projectId,
        conversationId,
        text,
        ...(Object.keys(onScreen).length ? { onScreen } : {})
      });
      if (!sent.ok) {
        if (sent.failure) return chatFailure(sent.failure);
        const sentence = sent.error ?? "The message could not be sent.";
        return { ok: false, code: "failed", sentence, detail: sentence };
      }
      commitConversationChanged({ projectId: project.projectId, conversationId });
      return {
        ok: true,
        value: {
          ...(opened === undefined ? {} : { conversation: opened }),
          ...(sent.problem ? { problem: sent.problem } : {})
        }
      };
    },

    answer: (answer) => answerAsk(api, options, answer),

    ...createThreadChanges(api, options)
  };
}

function recordId(conversation: unknown): string | undefined {
  const id = conversation && typeof conversation === "object" ? (conversation as { conversationId?: unknown }).conversationId : undefined;
  return typeof id === "string" && id.trim() ? id.trim() : undefined;
}
