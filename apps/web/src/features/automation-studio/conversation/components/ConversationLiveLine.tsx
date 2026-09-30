"use client";

// What FluxIQ is doing right now, as the last line of the chat while Core
// works: the unit of work ("Building your Flow") and, under it, the latest
// thing it is doing in words, paced by `activity/pacer.ts` so neither
// flickers. It changes in place and is always drawn after the last message.

import type { ConversationActivityDisplay } from "../activity";

export function ConversationLiveLine(props: { live: ConversationActivityDisplay }) {
  const { live } = props;
  return (
    <div aria-label="What FluxIQ is doing" aria-live="polite" className="automation-conversation-live" data-outcome={live.outcome ?? "working"} role="status">
      <span aria-hidden className="automation-conversation-live-mark" />
      <div>
        <strong>{live.headline}</strong>
        {live.detail ? <span>{live.detail}</span> : null}
      </div>
    </div>
  );
}
