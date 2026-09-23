// The seam that lets a turn carry something drawn rather than written.
//
// A turn's `attachment` is `{ kind, ref }` -- a reference, never a payload --
// so the thread never renders an attachment itself. It looks the kind up here,
// asks the view to resolve the reference, and hands the result to whichever
// component owns that kind. Adding a dataset preview or a screenshot is one
// component and one entry in this map; the thread does not change.
//
// An unknown kind is not an error. A turn written by a newer Core than this
// panel renders its reference and an open action, which is the contract's own
// promise and nothing more.

import type { ComponentType } from "react";
import { FlowGraphDiffAttachment } from "./FlowGraphDiffAttachment";

export type ConversationAttachmentRenderer = ComponentType<{ payload: unknown; attachmentRef: string }>;

const RENDERERS: Readonly<Record<string, ConversationAttachmentRenderer>> = Object.freeze({
  "flow-graph-diff": FlowGraphDiffAttachment
});

const LABELS: Readonly<Record<string, string>> = Object.freeze({
  "flow-graph-diff": "Proposed Flow change",
  "dataset-preview": "Collected data",
  screenshot: "Screenshot"
});

export function conversationAttachmentRenderer(kind: string): ConversationAttachmentRenderer | null {
  return RENDERERS[kind] ?? null;
}

/** What the reference is called when nothing here can draw it. */
export function conversationAttachmentLabel(kind: string): string {
  return LABELS[kind] ?? "Attachment";
}

export function conversationAttachmentKinds(): string[] {
  return Object.keys(RENDERERS);
}
