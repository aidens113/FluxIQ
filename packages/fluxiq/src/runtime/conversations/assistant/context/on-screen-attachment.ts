// The page and selection a person wrote a message on, kept with that message in a project's thread.
//
// A message to the panel's chat in a project is stored as the project's person turn; what the person had
// open is stored with it as this attachment, so the work the panel assistant does on the message (and an
// Allow pressed later) is judged by what was selected when it was said, never by a later screen. The
// reference is base64url JSON of the chat's `onScreen` (`page`, `selection`, `flowId`, `runId`): a turn's
// reference is an identifier-shaped string. Clients that draw the thread hide it: it is context, not content.
// Read strictly through `panelAssistantContextOf`, so nothing in it is trusted beyond what that accepts.

/** The attachment kind of a person turn that carries the page and selection it was written on. */
export const PANEL_ASSISTANT_ON_SCREEN_ATTACHMENT = "panel.on-screen";

/** The page and selection an attachment of that kind carries, or undefined for any other attachment; an unreadable one carries nothing. */
export function panelAssistantOnScreenOf(attachment: { kind: string; ref: string } | null | undefined): unknown {
  if (attachment?.kind !== PANEL_ASSISTANT_ON_SCREEN_ATTACHMENT) return undefined;
  const text = Buffer.from(attachment.ref, "base64url").toString("utf8");
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error("The page and selection kept with this message could not be read.", { cause: error });
  }
}
