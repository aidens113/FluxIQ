// The conversation the current async context is working for.
//
// A build or a run started from the chat does not know it was started from the
// chat: it is the same service call a button makes, and its questions go to
// the thread of its own subject (`openConversation` without an id). When the
// chat's command executor starts one, it runs it inside this storage, so the
// thread the person is typing in is found by whatever deep inside the work has
// something to say -- no conversation id threaded through a dozen signatures
// that have nothing to do with conversations.
//
// Deliberately free of imports beyond the platform, so the activity stream can
// read it without pulling in the conversation store.

import { AsyncLocalStorage } from "node:async_hooks";

/** The chat thread a unit of work was started from. */
export type AutomationStudioConversationAmbient = {
  projectId: string;
  conversationId: string;
};

export const automationStudioConversationAmbientStorage = new AsyncLocalStorage<AutomationStudioConversationAmbient>();
