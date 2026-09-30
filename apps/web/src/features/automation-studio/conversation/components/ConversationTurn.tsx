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
//
// It reads as a chat, not a log: the person's words sit on the right in a
// bubble, FluxIQ's run the full width as formatted text (`ConversationText`),
// and the panel's own records ("Started the run") are a quiet line. Who said
// it and when stay in the turn for a screen reader and on hover, not as a
// header over every message.

import { formatRuntimeTimestamp } from "../../runtime";
import {
  CONVERSATION_PANEL_RESULT_ATTACHMENT,
  conversationAttachmentIsPanelRecord,
  type ConversationAnswer,
  type ConversationTurn as ConversationTurnRecord
} from "../thread";
import type { ConversationCommands } from "../conversation-host";
import { ConversationAskForm } from "./ConversationAskForm";
import { ConversationAttachmentPanel } from "./ConversationAttachmentPanel";
import { ConversationText } from "./ConversationText";

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
  // What the panel did on the person's behalf is written through the person's
  // own endpoint, but it is the panel speaking, and "You: Started the run"
  // would put words in the person's mouth.
  const panelRecord = turn.attachment?.kind === CONVERSATION_PANEL_RESULT_ATTACHMENT;
  const fromPerson = turn.author === "person" && !panelRecord;
  const author = fromPerson ? "You" : panelRecord ? "FluxIQ panel" : "FluxIQ";
  const said = formatRuntimeTimestamp(turn.createdAt);
  return (
    <article
      className={`automation-conversation-turn ${fromPerson ? "person" : "automation"}${panelRecord ? " panel-record" : ""}`}
      title={said}
    >
      <header className="automation-conversation-turn-meta">
        <strong>{author}</strong>
        <time dateTime={new Date(turn.createdAt).toISOString()}>{said}</time>
      </header>
      {turn.text
        ? fromPerson || panelRecord
          ? <p className="automation-conversation-bubble">{turn.text}</p>
          : <ConversationText text={turn.text} />
        : null}
      {turn.attachment && !conversationAttachmentIsPanelRecord(turn.attachment.kind) ? (
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
