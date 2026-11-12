// The docked Assistant's conversation when a project is open: the person's own
// panel threads and that project's threads in one list, each call going to the
// port the thread belongs to.
//
// Origin is what each list read said (a record from `list-panel-threads` is a
// panel thread, one from `list-conversations` is the project's), else the
// record's project (`panel` is the reserved panel project). A thread the lists
// have not named yet goes to the panel port, as before the project's threads
// were listed; a new chat is the person's own.
//
// The shared conversation list has no groups, so a project's thread is told
// apart by its name ("<project> · <title>"): the person's own chats first in
// the read, then the project's. A rename strips that prefix again so it is
// never stored in Core.

import type { ChatConversationPort, ChatResult } from "@fluxiq/ui-components";

const PANEL_PROJECT = "panel";
const SEPARATOR = " · ";
const UNTITLED = "Chat";

export type ComposedConversationOptions = {
  panel: ChatConversationPort;
  project: ChatConversationPort;
  /** The project the person has open, or undefined when none is; its name labels its threads. */
  openProject(): { projectId: string; name?: string | undefined } | undefined;
};

type Origin = "panel" | "project";

export function createComposedConversationPort(options: ComposedConversationOptions): ChatConversationPort {
  const origins = new Map<string, Origin>();
  const prefixes = new Map<string, string>();

  const originOf = (conversationId: string | undefined, projectId: string | undefined): Origin => {
    const known = conversationId === undefined ? undefined : origins.get(conversationId);
    if (known) return known;
    const project = projectId?.trim();
    return project && project !== PANEL_PROJECT ? "project" : "panel";
  };
  const portFor = (origin: Origin): ChatConversationPort => (origin === "panel" ? options.panel : options.project);

  const port: ChatConversationPort = {
    listThreads: (query) => portFor(query.subjectKind === "panel" ? "panel" : "project").listThreads(query),

    async listAllThreads(query) {
      const own = await options.panel.listAllThreads!(query);
      const open = options.openProject();
      if (!own.ok || !open) {
        if (own.ok) remember(own, "panel");
        return own;
      }
      const theirs = await options.project.listAllThreads!({ projectId: open.projectId, limit: query.limit });
      if (!theirs.ok) return theirs;
      const group = open.name?.trim() || "This project";
      return { ok: true, value: { conversations: [...remember(own, "panel"), ...remember(theirs, "project", group)] } };
    },

    readThread: (query) => portFor(originOf(query.conversationId, query.projectId)).readThread(query),

    send: (message) => portFor(originOf(message.conversationId, message.projectId)).send(message),

    answer: (answer) => portFor(originOf(answer.turn?.conversationId, answer.projectId)).answer(answer),

    newThread: (request) => options.panel.newThread!(request),

    renameThread(request) {
      const origin = originOf(request.conversationId, request.projectId);
      const prefix = prefixes.get(request.conversationId);
      const title = prefix && request.title.startsWith(prefix) ? request.title.slice(prefix.length) : request.title;
      return portFor(origin).renameThread!({ ...request, title });
    },

    deleteThread: (request) => portFor(originOf(request.conversationId, request.projectId)).deleteThread!(request)
  };
  return port;

  /** Notes where each listed thread came from and, for a project's, words its name; returns the records. */
  function remember(result: ChatResult<{ conversations?: unknown }>, origin: Origin, group?: string): unknown[] {
    const records = result.ok && Array.isArray(result.value.conversations) ? result.value.conversations as unknown[] : [];
    return records.map((record) => {
      const id = idOf(record);
      if (id === undefined) return record;
      origins.set(id, origin);
      if (group === undefined) return record;
      const prefix = `${group}${SEPARATOR}`;
      prefixes.set(id, prefix);
      const title = (record as { title?: unknown }).title;
      const own = typeof title === "string" && title.trim() ? title.trim() : UNTITLED;
      return { ...(record as object), title: `${prefix}${own}` };
    });
  }
}

function idOf(record: unknown): string | undefined {
  const id = record && typeof record === "object" ? (record as { conversationId?: unknown }).conversationId : undefined;
  return typeof id === "string" && id ? id : undefined;
}
