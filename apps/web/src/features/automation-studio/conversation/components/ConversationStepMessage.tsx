"use client";

// One of FluxIQ's step messages, the way it reads in the chat: what it is
// doing in bold and why after a dash, on FluxIQ's side of the conversation,
// with the action it led to as a card beneath.
//
//   **Clicking “Get a free quote”** — The quote form is behind this button,
//   so I'm opening it.
//   [icon] Click  Get a free quote
//          Done
//
// A run step and an action with no reasoning before it are their card alone:
// the card already says what was done, so a line of words above it would say
// it twice.
//
// React keeps the element for the message's key (`activityId#sequence` of the
// event that opened it), and each card's for its own, so neither remounts
// while an action starts and ends; only the words and marks that changed are
// redrawn. No disclosure, no step count, and never a tool id, a node id or a
// result code.

import { formatRuntimeTimestamp } from "../../runtime";
import type { ConversationStepMessage as StepMessage } from "../activity";
import { ConversationActionCard } from "./action-card";

export function ConversationStepMessage(props: {
  message: StepMessage;
  /** True while the message's unit of work is still running. */
  working: boolean;
}) {
  const { message } = props;
  const cardOnly = (message.kind === "step" || message.kind === "action") && message.actions.length > 0;
  const last = message.actions.length - 1;
  return (
    <article className="automation-conversation-step" data-kind={message.kind} title={formatRuntimeTimestamp(message.atMs)}>
      <span className="automation-conversation-sr">FluxIQ: </span>
      {cardOnly ? null : (
        <p className="automation-conversation-step-line">
          <strong>{message.title}</strong>
          {message.text ? <span className="automation-conversation-step-text">{` — ${message.text}`}</span> : null}
        </p>
      )}
      {message.actions.map((action, index) => (
        <ConversationActionCard action={action} key={action.key} live={props.working && message.latest && index === last} />
      ))}
    </article>
  );
}
