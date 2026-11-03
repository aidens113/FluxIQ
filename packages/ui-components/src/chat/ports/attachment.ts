// How a host shows what a turn carries beside its words. Absent, the chat shows
// no attachment and draws every turn by its author alone.

import type { ChatResult } from "./result.ts";
import type { ChatAttachment } from "./transport.ts";

/** Which turn's attachment. A thread's read is project-scoped, so it says its project. */
export type ChatAttachmentContext = { attachment: ChatAttachment; projectId: string; conversationId: string; turnId: string };

/** Draws a resolved attachment. Plain DOM; it never throws on a payload it cannot read, it says so. */
export type ChatAttachmentDraw = (payload: unknown, attachment: ChatAttachment) => HTMLElement;

export type ChatAttachmentPort = {
  /**
   * The host's own record of something it did, written through the person's
   * endpoint: told as a quiet line by the host, never as the person's bubble.
   */
  isRecord?(attachment: ChatAttachment): boolean;
  /** Nothing to show: the turn's own words already say it. */
  isHidden?(attachment: ChatAttachment): boolean;
  /** What the reference is called when nothing can draw it. */
  label(kind: string): string;
  /** The drawer for `kind`, or null: the chat then shows the reference and, with `open`, an Open button. */
  drawer(kind: string): ChatAttachmentDraw | null;
  /** Resolves the reference. Absent: a drawable kind still shows as a reference. */
  read?(context: ChatAttachmentContext): Promise<ChatResult<unknown>>;
  /** Goes to what the reference names, in the host. */
  open?(attachment: ChatAttachment): void;
  /** Whether `open` can go anywhere now, asked each time a reference is drawn; absent, it always can. */
  canOpen?(): boolean;
};
