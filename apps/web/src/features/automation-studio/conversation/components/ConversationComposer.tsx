"use client";

// The person saying something unprompted.
//
// This is the half of the channel that makes "take feedback" work at all: the
// thread is not only a place FluxIQ asks questions, it is where someone says
// what they wanted, and FluxIQ reads it on its next turn.

import { useState } from "react";
import { SendHorizontal } from "lucide-react";
import { Button } from "../../../programs/components";
import { CONVERSATION_TEXT_MAX } from "../thread";

export function ConversationComposer(props: {
  busy: boolean;
  disabled?: boolean;
  onSend(text: string): Promise<boolean>;
}) {
  const [text, setText] = useState("");

  async function send() {
    const value = text.trim();
    if (!value || props.busy || props.disabled) return;
    const sent = await props.onSend(value);
    if (sent) setText("");
  }

  return (
    <form
      aria-label="Write to FluxIQ"
      className="automation-conversation-composer"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      <textarea
        aria-label="Message"
        disabled={props.disabled}
        maxLength={CONVERSATION_TEXT_MAX}
        placeholder="Tell FluxIQ what you want, or answer in your own words."
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
    </form>
  );
}
