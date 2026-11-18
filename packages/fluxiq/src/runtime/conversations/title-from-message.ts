// What a thread is called once a person has said something in it: their first
// message, trimmed to one short line. Without it every thread of a project
// reads the same in the Chats list and the chat bar.

/** Long enough to tell threads apart, short enough to sit on one line of the list. */
export const AUTOMATION_STUDIO_CONVERSATION_FIRST_MESSAGE_TITLE_MAX = 60;

/** The first message as a title: whitespace collapsed, cut at a word with an ellipsis, or null when it says nothing. */
export function automationStudioConversationTitleFromMessage(text: string): string | null {
  const line = text.replace(/\s+/gu, " ").trim();
  if (!line) return null;
  const max = AUTOMATION_STUDIO_CONVERSATION_FIRST_MESSAGE_TITLE_MAX;
  if (line.length <= max) return line;
  const cut = line.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}\u2026`;
}
