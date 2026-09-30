"use client";

// One live activity row between the turns: what Core did, a tool call, a step,
// a check, and whether it has finished. It is drawn as a turn from FluxIQ so
// the transcript reads as one conversation, and it expands to the detail Core
// sent with it -- the text, the tool or node id, the status -- and nothing it
// did not.

import { Activity } from "lucide-react";
import { StatusBadge } from "../../../programs/components";
import { formatRuntimeTimestamp } from "../../runtime";
import type { ConversationActivity } from "../activity";

export function ConversationActivityRow(props: { activity: ConversationActivity }) {
  const { activity } = props;
  const detail = activity.detail;
  if (!detail) return null;
  const expandable = Boolean(detail.text || detail.ref || detail.status);
  return (
    <article className="automation-conversation-turn automation automation-conversation-activity-row" data-activity-kind={detail.kind}>
      <header>
        <Activity aria-hidden size={14} />
        <strong>{detail.title}</strong>
        {detail.status ? <StatusBadge value={detail.status} /> : null}
        <time dateTime={activity.at}>{formatRuntimeTimestamp(activity.atMs)}</time>
      </header>
      {expandable ? (
        <details>
          <summary>Details</summary>
          {detail.text ? <p>{detail.text}</p> : null}
          {detail.ref ? <small className="automation-conversation-attachment-ref"><code>{detail.ref}</code></small> : null}
          {detail.status ? <small>{`Status: ${detail.status}`}</small> : null}
        </details>
      ) : null}
    </article>
  );
}
