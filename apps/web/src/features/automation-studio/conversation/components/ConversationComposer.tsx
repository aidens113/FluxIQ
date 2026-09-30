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
// One rounded box pinned to the foot of the window with the send arrow inside
// it, the way every chat reads. Enter sends and Shift+Enter starts a new line.
// The box grows with what is typed -- wrapped lines as well as new ones -- up
// to its CSS max-height, then scrolls, and says how much room is left only
// when little is. While a message is on its way the arrow becomes a spinner;
// it never shows both.

import { useLayoutEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
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
  const boxRef = useRef<HTMLTextAreaElement | null>(null);

  // Measured rather than counted: a long line wraps without a newline in it.
  // `auto` first, so the box also shrinks when text is deleted; the CSS
  // max-height caps it and the box scrolls from there.
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    box.style.height = "auto";
    box.style.height = `${box.scrollHeight}px`;
  }, [text]);

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
      <div className="automation-conversation-composer-row" data-disabled={props.disabled ? "true" : "false"}>
        <textarea
          aria-label="Message"
          disabled={props.disabled}
          maxLength={CONVERSATION_TEXT_MAX}
          placeholder={props.disabled ? "" : "Message FluxIQ"}
          ref={boxRef}
          rows={1}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            // An IME confirming a character uses Enter too; that is not a send.
            if (event.key !== "Enter" || event.shiftKey || event.nativeEvent?.isComposing) return;
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
          {props.busy ? null : <ArrowUp aria-hidden size={16} strokeWidth={2.5} />}
          <span className="automation-conversation-sr">Send</span>
        </Button>
      </div>
      {!props.disabled && remaining < 500 ? (
        <p className="automation-conversation-composer-hint">{`${remaining.toLocaleString()} characters left.`}</p>
      ) : null}
    </form>
  );
}
