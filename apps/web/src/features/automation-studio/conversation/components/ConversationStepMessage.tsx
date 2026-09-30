"use client";

// One of FluxIQ's step messages, the way it reads in the chat: what it is
// doing in bold and why after a dash, on FluxIQ's side of the conversation,
// with a quiet line beneath saying how the action went.
//
//   **Clicking “Get a free quote”** — The quote form is behind this button,
//   so I'm opening it.
//   ✓ Done
//
// React keeps the element for the message's key (`activityId#sequence` of the
// event that opened it), so a message never remounts while its action starts
// and ends; only the words and marks that changed are redrawn. No disclosure,
// no step count, and never a tool id, a node id or a result code.

import { Check, X } from "lucide-react";
import { formatRuntimeTimestamp } from "../../runtime";
import { conversationStepOutcomeWords, type ConversationStepMessage as StepMessage } from "../activity";

export function ConversationStepMessage(props: {
  message: StepMessage;
  /** True while the message's unit of work is still running. */
  working: boolean;
}) {
  const { message } = props;
  const said = conversationStepOutcomeWords(message, props.working);
  return (
    <article
      className="automation-conversation-step"
      data-kind={message.kind}
      data-outcome={said?.state ?? "none"}
      title={formatRuntimeTimestamp(message.atMs)}
    >
      <span className="automation-conversation-sr">FluxIQ: </span>
      <p className="automation-conversation-step-line">
        <strong>{message.title}</strong>
        {message.text ? <span className="automation-conversation-step-text">{` — ${message.text}`}</span> : null}
      </p>
      {said ? (
        <p className="automation-conversation-step-outcome" data-state={said.state}>
          <OutcomeMark state={said.state} />
          <span>{said.label}</span>
        </p>
      ) : null}
    </article>
  );
}

function OutcomeMark(props: { state: "working" | "succeeded" | "failed" }) {
  if (props.state === "succeeded") return <Check aria-hidden className="automation-conversation-step-mark" size={12} strokeWidth={2.5} />;
  if (props.state === "failed") return <X aria-hidden className="automation-conversation-step-mark" size={12} strokeWidth={2.5} />;
  return <span aria-hidden className="automation-conversation-step-mark automation-conversation-step-spinner" />;
}
