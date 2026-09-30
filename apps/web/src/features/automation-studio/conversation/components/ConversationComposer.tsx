"use client";

// The person saying something unprompted.
//
// This is the half of the channel that makes "take feedback" work at all: the
// thread is not only a place FluxIQ asks questions, it is where someone says
// what they wanted, and FluxIQ reads it on its next turn.
//
// **A composer that cannot be used says why.** It was previously a `disabled`
// textarea whenever no thread was selected, which is exactly the state a live
// panel sat in, so the first thing anyone met was a box that would not take a
// click and gave no reason. Now the box is only disabled when there is genuinely
// nowhere to send -- and when it is, the reason sits above it in words.
//
// One rounded box at the foot of the window with the send arrow inside it,
// the way every chat reads. The box grows with what is typed, up to six
// lines, and says how much room is left only when little is.

import { useState } from "react";
import { ArrowUp } from "lucide-react";
import { Button } from "../../../programs/components";
import { CONVERSATION_TEXT_MAX } from "../thread";

const COMPOSER_ROWS_MAX = 6;

export function ConversationComposer(props: {
  busy: boolean;
  disabled?: boolean;
  /** Why there is nowhere to send this yet. Shown above the box whenever it is set. */
  unavailableReason?: string;
  onSend(text: string): Promise<boolean>;
}) {
  const [text, setText] = useState("");

  async function send() {
    const value = text.trim();
    if (!value || props.busy || props.disabled) return;
    const sent = await props.onSend(value);
    if (sent) setText("");
  }

  const remaining = CONVERSATION_TEXT_MAX - text.length;
  const rows = Math.min(COMPOSER_ROWS_MAX, Math.max(1, text.split("\n").length));
  return (
    <form
      aria-label="Write to FluxIQ"
      className="automation-conversation-composer"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      {props.unavailableReason ? (
        <p className="automation-conversation-composer-reason">{props.unavailableReason}</p>
      ) : null}
      <div className="automation-conversation-composer-row">
        <textarea
          aria-label="Message"
          disabled={props.disabled}
          maxLength={CONVERSATION_TEXT_MAX}
          placeholder={props.disabled ? "" : "Message FluxIQ"}
          rows={rows}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey) return;
            event.preventDefault();
            void send();
          }}
        />
        <Button
          busy={props.busy}
          className="automation-conversation-send"
          disabled={props.disabled || !text.trim()}
          title="Send (Enter). Shift and Enter start a new line."
          type="submit"
          variant="primary"
        >
          <ArrowUp aria-hidden size={16} />
          <span className="automation-conversation-sr">Send</span>
        </Button>
      </div>
      {!props.disabled && remaining < 500 ? (
        <p className="automation-conversation-composer-hint">{`${remaining.toLocaleString()} characters left.`}</p>
      ) : null}
    </form>
  );
}
