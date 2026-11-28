// The panel's docked chat: project chats, with the person's earlier chats beside them.
//
// Every new chat belongs to a project (t1095): a first message or New chat goes to the project port, which
// starts it in the open project or, with none open, in the person's own project (`personProject`). The
// panel and every client read that project's conversation store, so the extension shows the same chat.
//
// Before that, the dock kept chats of its own with no project (panel threads, `list-panel-threads`). They
// stay where they live: listed after the project's chats, named "No project · <title>", and read,
// continued, answered, renamed and deleted on the panel assistant's endpoints. Nothing new is made there.
//
// Origin is what each list read said (a record from `list-panel-threads` is a panel thread, one from
// `list-conversations` is a project's), else the record's project: the reserved `panel` names a panel
// thread, anything else (or nothing, for a chat not started yet) a project's.

import type { ChatConversationPort, ChatResult } from "@fluxiq/ui-components";

const PANEL_PROJECT = "panel";
const EARLIER = "No project · ";
const UNTITLED = "Chat";

export type ComposedConversationOptions = {
  /** The person's earlier chats with no project, on the panel assistant's endpoints. */
  panel: ChatConversationPort;
  project: ChatConversationPort;
  /** The project the person has open, or undefined when none is. */
  openProject(): { projectId: string; name?: string | undefined } | undefined;
};

type Origin = "panel" | "project";

export function createComposedConversationPort(options: ComposedConversationOptions): ChatConversationPort {
  const origins = new Map<string, Origin>();

  const originOf = (conversationId: string | undefined, projectId: string | undefined): Origin => {
    const known = conversationId === undefined ? undefined : origins.get(conversationId);
    if (known) return known;
    return projectId?.trim() === PANEL_PROJECT ? "panel" : "project";
  };
  const portFor = (origin: Origin): ChatConversationPort => (origin === "panel" ? options.panel : options.project);

  return {
    listThreads: (query) => portFor(query.subjectKind === "panel" ? "panel" : "project").listThreads(query),

    // The open project's chats (every project's with none open), then the person's earlier ones.
    async listAllThreads(query) {
      const open = options.openProject();
      const theirs = await options.project.listAllThreads!({ ...query, ...(open ? { projectId: open.projectId } : {}) });
      if (!theirs.ok) return theirs;
      const own = await options.panel.listAllThreads!(query);
      if (!own.ok) return own;
      return { ok: true, value: { conversations: [...remember(theirs, "project"), ...remember(own, "panel")] } };
    },

    readThread: (query) => portFor(originOf(query.conversationId, query.projectId)).readThread(query),

    // A new chat is never started in the reserved `panel` id: it starts in the open project, else the person's.
    send: (message) => {
      if (message.conversationId?.trim()) return portFor(originOf(message.conversationId, message.projectId)).send(message);
      return options.project.send({ ...message, projectId: realProject(message.projectId) });
    },

    answer: (answer) => portFor(originOf(answer.turn?.conversationId, answer.projectId)).answer(answer),

    newThread: (request) => {
      const { projectId, ...rest } = request;
      const real = realProject(projectId);
      return options.project.newThread!({ ...rest, ...(real === undefined ? {} : { projectId: real }) });
    },

    renameThread(request) {
      const origin = originOf(request.conversationId, request.projectId);
      const title = origin === "panel" && request.title.startsWith(EARLIER) ? request.title.slice(EARLIER.length) : request.title;
      return portFor(origin).renameThread!({ ...request, title });
    },

    deleteThread: (request) => portFor(originOf(request.conversationId, request.projectId)).deleteThread!(request)
  };

  /** Notes where each listed thread came from and, for an earlier one, says it has no project; returns the records. */
  function remember(result: ChatResult<{ conversations?: unknown }>, origin: Origin): unknown[] {
    const records = result.ok && Array.isArray(result.value.conversations) ? result.value.conversations as unknown[] : [];
    return records.map((record) => {
      const id = idOf(record);
      if (id === undefined) return record;
      origins.set(id, origin);
      if (origin === "project") return record;
      const title = (record as { title?: unknown }).title;
      const own = typeof title === "string" && title.trim() ? title.trim() : UNTITLED;
      return { ...(record as object), title: `${EARLIER}${own}` };
    });
  }
}

function realProject(projectId: string | undefined): string | undefined {
  const id = projectId?.trim();
  return id && id !== PANEL_PROJECT ? id : undefined;
}

function idOf(record: unknown): string | undefined {
  const id = record && typeof record === "object" ? (record as { conversationId?: unknown }).conversationId : undefined;
  return typeof id === "string" && id ? id : undefined;
}
