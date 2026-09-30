"use client";

// Core's work between two turns, drawn quietly under the turn that asked for
// it.
//
// While Core is working, the block at the tail of the stream carries the live
// status: the unit of work ("Building your Flow") and, under it, the latest
// thing it did in words, paced by `activity/pacer.ts` so neither flickers. The
// steps sit folded underneath ("8 steps so far"). Once the work settles the
// status goes and the fold reads "Worked for 2m 5s · 14 steps".
//
// A step says what Core did in a person's words (`activity/wording.ts`) and
// marks whether it worked. No tool id, node id or result code is drawn: those
// are Core's bookkeeping, and they stay in Core's records.

import { Check, X } from "lucide-react";
import {
  conversationActivityDuration,
  conversationActivitySentence,
  type ConversationActivity,
  type ConversationActivityDetailStatus,
  type ConversationActivityDisplay
} from "../activity";

export function ConversationActivityBlock(props: {
  rows: readonly ConversationActivity[];
  /** The paced status while this block is the live one; absent once the work settled. */
  live?: ConversationActivityDisplay | null;
  /** How the work ended when it did not end well ("Build failed"); the summary leads with it. */
  settledHeadline?: string | null;
}) {
  const { rows, live } = props;
  const steps = rows.length;
  const count = `${steps} step${steps === 1 ? "" : "s"}`;
  const duration = conversationActivityDuration(rows);
  const summary = live
    ? `${count} so far`
    : [props.settledHeadline ?? (duration ? `Worked for ${duration}` : null), count].filter(Boolean).join(" · ");
  return (
    <section aria-label="What FluxIQ did" className="automation-conversation-activity" data-live={live ? "true" : "false"}>
      {live ? (
        <div aria-label="What FluxIQ is doing" aria-live="polite" className="automation-conversation-activity-live" data-outcome={live.outcome ?? "working"} role="status">
          <span aria-hidden className="automation-conversation-activity-mark" />
          <div>
            <strong>{live.headline}</strong>
            {live.detail ? <span>{live.detail}</span> : null}
          </div>
        </div>
      ) : null}
      {steps ? (
        <details className="automation-conversation-activity-steps">
          <summary>{summary}</summary>
          <ol>
            {rows.map((row) => (
              <li data-status={row.detail?.status ?? "started"} key={row.sequence} title={new Date(row.atMs).toLocaleTimeString()}>
                <StepMark status={row.detail?.status} />
                <span>{conversationActivitySentence(row)}</span>
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </section>
  );
}

function StepMark(props: { status: ConversationActivityDetailStatus | undefined }) {
  if (props.status === "succeeded") return <Check aria-label="Worked" className="automation-conversation-activity-step-mark" size={13} />;
  if (props.status === "failed") return <X aria-label="Didn't work" className="automation-conversation-activity-step-mark" size={13} />;
  return <span aria-hidden className="automation-conversation-activity-step-dot" />;
}
