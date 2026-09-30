"use client";

// What FluxIQ is doing now, above the transcript: Core's phase as a chip, its
// own status sentence, and the step it is on.
//
// Every word is the latest event's. There is no elapsed-time counter, no
// "still working..." after a pause, and nothing that changes on its own: the
// header moves only when Core says something new.

import { StatusBadge } from "../../../programs/components";
import { conversationActivityStepText, type ConversationActivity } from "../activity";

export function ConversationActivityHeader(props: { activity: ConversationActivity }) {
  const { activity } = props;
  const step = activity.step ? conversationActivityStepText(activity.step) : null;
  const detail = [step, activity.step?.label].filter(Boolean).join(" - ");
  return (
    <div aria-label="What FluxIQ is doing" aria-live="polite" className="automation-conversation-header automation-conversation-activity" role="status">
      <StatusBadge value={activity.phase} />
      <div className="automation-conversation-title">
        <strong>{activity.label}</strong>
        {detail ? <span>{detail}</span> : null}
      </div>
    </div>
  );
}
