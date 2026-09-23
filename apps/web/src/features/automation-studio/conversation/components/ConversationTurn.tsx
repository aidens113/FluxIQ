"use client";

// One turn: who said it, when, what they said, anything it carries, and the
// answer it is still waiting for.
//
// The turn is where dispatch happens, which is what makes the thread able to
// hold a diff, a dataset preview or a screenshot without being redesigned for
// each: text is text, an attachment goes to whichever component owns its kind,
// and an ask that is still pending becomes a form. An ask already answered or
// expired shows its outcome rather than a second set of buttons, because an
// ask is answered once.

import { Bot, User } from "lucide-react";
import { formatRuntimeTimestamp } from "../../runtime";
import type { ConversationAnswer, ConversationTurn as ConversationTurnRecord } from "../thread";
import type { ConversationCommands } from "../conversation-host";
import { ConversationAskForm } from "./ConversationAskForm";
import { ConversationAttachmentPanel } from "./ConversationAttachmentPanel";

export function ConversationTurn(props: {
  turn: ConversationTurnRecord;
  projectId: string;
  busy: boolean;
  error?: string;
  loadAttachment?: ConversationCommands["loadAttachment"];
  onAnswer(answer: ConversationAnswer, authorizationPin?: string): Promise<boolean>;
  onOpenAttachment?(attachment: { kind: string; ref: string }): void;
}) {
  const { turn } = props;
  const fromPerson = turn.author === "person";
  const Icon = fromPerson ? User : Bot;
  return (
    <article className={`automation-conversation-turn ${fromPerson ? "person" : "automation"}`}>
      <header>
        <Icon aria-hidden size={14} />
        <strong>{fromPerson ? "You" : "FluxIQ"}</strong>
        <time dateTime={new Date(turn.createdAt).toISOString()}>{formatRuntimeTimestamp(turn.createdAt)}</time>
      </header>
      {turn.text ? <p>{turn.text}</p> : null}
      {turn.attachment ? (
        <ConversationAttachmentPanel
          attachment={turn.attachment}
          conversationId={turn.conversationId}
          projectId={props.projectId}
          turnId={turn.turnId}
          {...(props.loadAttachment ? { loadAttachment: props.loadAttachment } : {})}
          {...(props.onOpenAttachment ? { onOpenAttachment: props.onOpenAttachment } : {})}
        />
      ) : null}
      {turn.ask && turn.ask.status === "pending" ? (
        <ConversationAskForm
          ask={turn.ask}
          busy={props.busy}
          {...(props.error ? { error: props.error } : {})}
          onAnswer={props.onAnswer}
        />
      ) : null}
      {turn.ask && turn.ask.status !== "pending" ? (
        <small className="automation-conversation-ask-closed">
          {turn.ask.status === "answered" ? "Answered." : "This question expired before it was answered."}
        </small>
      ) : null}
    </article>
  );
}
