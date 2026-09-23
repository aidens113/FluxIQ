"use client";

// One turn's attachment: resolved and drawn where the panel owns a renderer
// for its kind, and shown as the reference it is where it does not.
//
// The degradation is the point. The fixed contract gives a turn only
// `{ kind, ref }`, so a panel that could not resolve a reference would have to
// either invent a payload or drop the attachment silently. It does neither: it
// names what the turn carries and offers to open it, which is exactly as much
// as the contract promised.

import { useEffect, useRef, useState } from "react";
import { Paperclip } from "lucide-react";
import { Button } from "../../../programs/components";
import { conversationAttachmentLabel, conversationAttachmentRenderer } from "./attachment-registry";
import type { ConversationCommands } from "../conversation-host";
import type { ConversationAttachment } from "../thread";

export function ConversationAttachmentPanel(props: {
  attachment: ConversationAttachment;
  /** The project the thread belongs to; Core's attachment read is project-scoped. */
  projectId: string;
  conversationId: string;
  turnId: string;
  loadAttachment?: ConversationCommands["loadAttachment"];
  onOpenAttachment?(attachment: ConversationAttachment): void;
}) {
  const Renderer = conversationAttachmentRenderer(props.attachment.kind);
  const [payload, setPayload] = useState<unknown>(undefined);
  const [failed, setFailed] = useState(false);
  const requestRef = useRef(0);
  const { attachment, conversationId, loadAttachment, projectId, turnId } = props;

  useEffect(() => {
    if (!Renderer || !loadAttachment) return;
    const controller = new AbortController();
    const generation = ++requestRef.current;
    void loadAttachment({ projectId, conversationId, turnId }, controller.signal).then((result) => {
      if (generation !== requestRef.current || result.aborted) return;
      if (!result.ok) {
        setFailed(true);
        return;
      }
      setFailed(false);
      setPayload(resolvedAttachmentPayload(result.payload?.attachment));
    });
    return () => controller.abort();
  }, [Renderer, attachment.ref, conversationId, loadAttachment, projectId, turnId]);

  if (Renderer && payload !== undefined) return <Renderer attachmentRef={attachment.ref} payload={payload} />;

  const label = conversationAttachmentLabel(attachment.kind);
  const message = failed
    ? `${label} could not be read here.`
    : Renderer && loadAttachment
      ? `Reading ${label.toLowerCase()}...`
      : `${label}, kept outside this conversation.`;
  return (
    <div className="automation-conversation-attachment-ref">
      <Paperclip aria-hidden size={14} />
      <span>{message}</span>
      <code>{attachment.ref}</code>
      {props.onOpenAttachment
        ? <Button onClick={() => props.onOpenAttachment?.(attachment)} size="compact">Open</Button>
        : null}
    </div>
  );
}

/**
 * Core answers `{ attachment: { attachment, payload } }`: the reference it
 * resolved, and what it resolved to. The renderer wants the second. A payload
 * that is not wrapped is passed through, so a double in a test can hand over
 * the thing itself.
 */
function resolvedAttachmentPayload(value: unknown): unknown {
  if (value && typeof value === "object" && "payload" in value && "attachment" in value) {
    return (value as { payload: unknown }).payload;
  }
  return value;
}
