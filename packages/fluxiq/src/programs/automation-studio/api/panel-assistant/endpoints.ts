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
