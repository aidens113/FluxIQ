/**
 * The panel assistant's own endpoints (`automation-studio/<name>`): its threads,
 * a turn's attachment, renaming and deleting a thread, a message, the answer to
 * its Allow card, and the per-message spending allowance. Each is hidden from
 * the assistant's tools: they are its own chat.
 */
export const PANEL_ASSISTANT_ENDPOINTS = Object.freeze({
  listThreads: "list-panel-threads",
  getThread: "get-panel-thread",
  getThreadAttachment: "get-panel-thread-attachment",
  openThread: "open-panel-thread",
  renameThread: "rename-panel-thread",
  deleteThread: "delete-panel-thread",
  send: "send-panel-message",
  answer: "answer-panel-ask",
  getAllowance: "get-panel-assistant-allowance",
  setAllowance: "set-panel-assistant-allowance"
} as const);

/**
 * The panel assistant's endpoint on a project, not on the person's own chats: a project's chat in the panel
 * hands a message to the assistant, which works in that project's thread. Decided on the project, so IAM's
 * project rules grant it, never the own-chat statement.
 */
export const PANEL_ASSISTANT_PROJECT_ENDPOINTS = Object.freeze({
  workInProjectThread: "work-in-project-thread"
} as const);
