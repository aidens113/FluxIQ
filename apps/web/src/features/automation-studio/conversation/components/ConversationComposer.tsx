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

import { useState } from "react";
import { SendHorizontal } from "lucide-react";
import { Button } from "../../../programs/components";
import { CONVERSATION_TEXT_MAX } from "../thread";

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
          placeholder={props.disabled ? "" : "Tell FluxIQ what you want, or answer in your own words."}
          rows={2}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey) return;
            event.preventDefault();
            void send();
          }}
        />
        <Button busy={props.busy} disabled={props.disabled || !text.trim()} type="submit" variant="primary">
          <SendHorizontal aria-hidden size={14} />
          Send
        </Button>
      </div>
      {props.disabled ? null : (
        <p className="automation-conversation-composer-hint">
          {remaining < 500
            ? `${remaining.toLocaleString()} characters left.`
            : "Enter sends. Shift and Enter start a new line."}
        </p>
      )}
    </form>
  );
}
