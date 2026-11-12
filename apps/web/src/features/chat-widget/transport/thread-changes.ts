// The thread list's New chat, Rename and Delete over Core's conversation
// endpoints (`open-conversation` with `fresh: true`, `rename-conversation`,
// `delete-conversation`). A rename or delete names the thread's own project
// when the request or the chat knows one; with none, Core looks for the thread
// in every project the person may change. Core's refusals (a thread still in
// use is `conversation_run_active`) pass through with Core's sentence.

import type { ChatConversationPort } from "@fluxiq/ui-components";
import { commitConversationChanged } from "../../automation-studio/conversation";
import type { ProgramCommandTransport } from "../../automation-studio/data/program-transport";
import { chatResult } from "./chat-result";
import type { ProgramChatTransportOptions } from "./options";
import { projectFor } from "./project-for";

type ThreadChanges = Pick<ChatConversationPort, "newThread" | "renameThread" | "deleteThread">;

const NO_TITLE = "A chat needs a name.";

export function createThreadChanges(api: ProgramCommandTransport, options: Pick<ProgramChatTransportOptions, "projectId">): ThreadChanges {
  const told = (projectId: string | undefined, conversationId: string | undefined): void => {
    if (projectId && conversationId) commitConversationChanged({ projectId, conversationId });
  };
  const named = (projectId: string | undefined) => projectId?.trim() || options.projectId()?.trim() || undefined;

  return {
    async newThread(request) {
      const project = projectFor(request.projectId, options);
      if (!project.ok) return project.failure;
      const subjectKind = request.subjectKind ?? "project";
      const subjectId = request.subjectId ?? (subjectKind === "project" ? project.projectId : undefined);
      const opened = chatResult<{ conversation?: unknown }>(await api.post("open-conversation", {
        projectId: project.projectId,
        subjectKind,
        ...(subjectId === undefined ? {} : { subjectId }),
        ...(request.title ? { title: request.title } : {}),
        fresh: true
      }));
      if (opened.ok) told(project.projectId, idOf(opened.value.conversation));
      return opened;
    },

    async renameThread(request) {
      const title = request.title.trim();
      if (!title) return { ok: false, code: "invalid_request", sentence: NO_TITLE };
      const projectId = named(request.projectId);
      const renamed = chatResult<{ conversation?: unknown }>(await api.post("rename-conversation", {
        ...(projectId === undefined ? {} : { projectId }),
        conversationId: request.conversationId,
        title
      }));
      if (renamed.ok) told(projectId, request.conversationId);
      return renamed;
    },

    async deleteThread(request) {
      const projectId = named(request.projectId);
      const deleted = chatResult<{ deleted?: boolean }>(await api.post("delete-conversation", {
        ...(projectId === undefined ? {} : { projectId }),
        conversationId: request.conversationId
      }));
      if (deleted.ok) told(projectId, request.conversationId);
      return deleted;
    }
  };
}

function idOf(conversation: unknown): string | undefined {
  const id = conversation && typeof conversation === "object" ? (conversation as { conversationId?: unknown }).conversationId : undefined;
  return typeof id === "string" && id.trim() ? id.trim() : undefined;
}
