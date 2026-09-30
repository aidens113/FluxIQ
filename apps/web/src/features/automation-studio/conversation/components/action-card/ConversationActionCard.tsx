"use client";

// One action FluxIQ took, as a card beside the reasoning that led to it:
//
//   [icon]  Click  Get a free quote
//           Didn't work: it wasn't on the page
//
// The icon sits in a mark tinted by how the action went, in the tone Core's
// `fluxiqStatusTone` gives that status everywhere else in the panel; the kind's
// short name (`ACTIVITY_ACTION_NAMES`) and what it acted on share the first
// line, and the outcome is said in words on the second. React keeps the card's
// element for its key, so an action that ends is redrawn in place.

import { ACTIVITY_ACTION_ICONS, ACTIVITY_ACTION_NAMES, fluxiqStatusTone } from "fluxiq/ui";
import { conversationStepOutcomeWords, type ConversationStepAction } from "../../activity";
import { CONVERSATION_ACTION_ICONS } from "./action-icons";

export function ConversationActionCard(props: {
  action: ConversationStepAction;
  /** True for the newest card of work still running: only it says "Working on it". */
  live: boolean;
}) {
  const { action } = props;
  const said = conversationStepOutcomeWords(action, props.live);
  const Icon = CONVERSATION_ACTION_ICONS[action.kind];
  const name = ACTIVITY_ACTION_NAMES[action.kind];
  const target = action.target ?? "the page";
  return (
    <div
      aria-label={`${name}: ${target}${said ? `. ${said.label}` : ""}`}
      className={`automation-conversation-action tone-${fluxiqStatusTone(said?.status ?? "")}`}
      data-kind={action.kind}
      data-outcome={said?.state ?? "none"}
      role="group"
    >
      <span aria-hidden className="automation-conversation-action-mark" data-icon={ACTIVITY_ACTION_ICONS[action.kind]}>
        <Icon aria-hidden size={14} strokeWidth={2} />
      </span>
      <div>
        <p><strong>{name}</strong><span>{target}</span></p>
        {said ? (
          <p className="automation-conversation-action-outcome">
            {said.state === "working" ? <span aria-hidden className="automation-conversation-step-spinner" /> : null}
            {said.label}
          </p>
        ) : null}
      </div>
    </div>
  );
}
