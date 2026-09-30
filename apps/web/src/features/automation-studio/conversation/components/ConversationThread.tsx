"use client";

// The transcript: ordered turns that append while the person is reading them.
//
// Two behaviours the panel has nowhere else. It follows its own tail -- an
// arriving turn scrolls into view, but only when the person was already at the
// bottom; someone who has scrolled up to re-read something is left where they
// are, and told that new turns arrived. And it is bounded: a long thread mounts
// its most recent turns and keeps the rest behind one control, because turns
// are variable height and the fixed-row virtualiser the run log uses would
// mis-measure every one of them.
//
// Core's live activity sits between the turns, folded into one quiet group per
// stretch of work (`activity/stream.ts`). It is ephemeral -- the thread stays
// the durable record -- so it is drawn here and never written into it. While
// Core is working, the status line is drawn at the tail of the stream, in
// place, under the message that asked for the work.

import { useLayoutEffect, useRef, useState } from "react";
import { Button, EmptyState } from "../../../programs/components";
import { ArrowDown, MessagesSquare, TriangleAlert } from "lucide-react";
import type { ConversationCommands } from "../conversation-host";
import {
  conversationActivityHeadline,
  conversationActivityOutcome,
  conversationStream,
  type ConversationActivity,
  type ConversationActivityDisplay
} from "../activity";
import {
  conversationFollowsTail,
  visibleConversationTurns,
  type ConversationAnswer,
  type ConversationTurn as ConversationTurnRecord
} from "../thread";
import { ConversationActivityBlock } from "./ConversationActivityBlock";
import { ConversationTurn } from "./ConversationTurn";

export function ConversationThread(props: {
  turns: readonly ConversationTurnRecord[];
  /** Core's live activity for the project; the events with a detail become rows. */
  activity?: readonly ConversationActivity[];
  /** The paced status while Core is working for this thread; drawn at the tail of the stream. */
  live?: ConversationActivityDisplay | null;
  /** The open thread, so an event that names another conversation stays out of this one. */
  conversationId?: string;
  /** The project the thread belongs to; a turn's attachment read is project-scoped. */
  projectId: string;
  busy: boolean;
  /** False while the surface holding the transcript is collapsed. */
  visible?: boolean;
  /** The turn holding the question the person still owes an answer to. */
  pendingTurnId?: string;
  error?: string;
  loadAttachment?: ConversationCommands["loadAttachment"];
  onAnswer(answer: ConversationAnswer, authorizationPin?: string): Promise<boolean>;
  onOpenAttachment?(attachment: { kind: string; ref: string }): void;
}) {
  const listRef = useRef<HTMLOListElement | null>(null);
  const followRef = useRef(true);
  const lastCountRef = useRef(0);
  const [showAll, setShowAll] = useState(false);
  const [behind, setBehind] = useState(false);
  const { turns: visible, hidden } = visibleConversationTurns(props.turns, showAll);
  const entries = conversationStream({
    turns: visible,
    activity: props.activity ?? [],
    earlierHidden: hidden > 0,
    ...(props.conversationId ? { conversationId: props.conversationId } : {})
  });
  const live = props.live ?? null;
  const tail = entries.at(-1);
  const liveGroup = live && tail?.kind === "activity" ? tail.group.key : null;
  // The live status needs no row yet: before Core has done anything with a
  // detail, it still says what it is working on.
  const entryCount = entries.length + (live && !liveGroup ? 1 : 0);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const grew = entryCount > lastCountRef.current;
    lastCountRef.current = entryCount;
    if (!grew) return;
    if (followRef.current) {
      list.scrollTop = list.scrollHeight;
      setBehind(false);
      return;
    }
    setBehind(true);
  }, [entryCount]);

  // A collapsed surface has no layout, so the effect above measures a zero-height
  // list and the transcript opens at the top of the oldest turn the person has
  // already read. Opening is the moment the geometry exists, so the tail is
  // found then.
  const onScreen = props.visible !== false;
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!onScreen || !list) return;
    list.scrollTop = list.scrollHeight;
    followRef.current = true;
    setBehind(false);
  }, [onScreen]);

  function jumpToTurn(turnId: string) {
    const list = listRef.current;
    const target = list?.querySelector<HTMLElement>(`[data-turn-id="${CSS.escape(turnId)}"]`);
    if (!list || !target) return;
    // Manual scroll maths rather than `scrollIntoView`: the transcript is a
    // nested scroller inside a floating panel, and the browser would scroll the
    // workspace behind it as well.
    list.scrollTop = target.offsetTop - list.offsetTop;
    trackScroll();
  }

  function trackScroll() {
    const list = listRef.current;
    if (!list) return;
    followRef.current = conversationFollowsTail({
      scrollTop: list.scrollTop,
      scrollHeight: list.scrollHeight,
      clientHeight: list.clientHeight
    });
    if (followRef.current) setBehind(false);
  }

  function jumpToLatest() {
    const list = listRef.current;
    if (!list) return;
    list.scrollTop = list.scrollHeight;
    followRef.current = true;
    setBehind(false);
  }

  if (!entryCount) {
    return (
      <EmptyState
        description="FluxIQ writes here when it has something to tell you or something to ask. You can write first."
        icon={<MessagesSquare aria-hidden size={18} />}
        title="Nothing said yet"
      />
    );
  }

  return (
    <div className="automation-conversation-thread-frame">
      {props.pendingTurnId ? (
        <div className="automation-conversation-thread-waiting">
          <TriangleAlert aria-hidden size={14} />
          <span>FluxIQ stopped here and is waiting on your answer.</span>
          <Button onClick={() => jumpToTurn(props.pendingTurnId!)} size="compact">Show me</Button>
        </div>
      ) : null}
      {hidden ? (
        <div className="automation-conversation-thread-earlier">
          <Button onClick={() => setShowAll(true)} size="compact">{`Show ${hidden} earlier turn${hidden === 1 ? "" : "s"}`}</Button>
        </div>
      ) : null}
      <ol
        aria-label="Conversation transcript"
        aria-live="polite"
        className="automation-conversation-thread"
        onScroll={trackScroll}
        ref={listRef}
      >
        {entries.map((entry) => entry.kind === "activity" ? (
          <li data-activity-group={entry.key} key={entry.key}>
            <ConversationActivityBlock
              live={entry.key === liveGroup ? live : null}
              rows={entry.group.rows}
              settledHeadline={settledHeadline(props.activity ?? [], entry.group.activityId)}
            />
          </li>
        ) : (
          <li data-turn-id={entry.turn.turnId} key={entry.key}>
            <ConversationTurn
              busy={props.busy}
              projectId={props.projectId}
              turn={entry.turn}
              {...(props.error ? { error: props.error } : {})}
              {...(props.loadAttachment ? { loadAttachment: props.loadAttachment } : {})}
              {...(props.onOpenAttachment ? { onOpenAttachment: props.onOpenAttachment } : {})}
              onAnswer={props.onAnswer}
            />
          </li>
        ))}
        {live && !liveGroup ? (
          <li data-activity-group="live" key="activity:live">
            <ConversationActivityBlock live={live} rows={[]} />
          </li>
        ) : null}
      </ol>
      {behind ? (
        <div className="automation-conversation-thread-behind">
          <Button onClick={jumpToLatest} size="compact" variant="primary">
            <ArrowDown aria-hidden size={13} />
            New turns below
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** How a group's work ended, when it ended badly or is waiting: the latest word Core said about that unit of work. */
function settledHeadline(events: readonly ConversationActivity[], activityId: string): string | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!;
    if (event.activityId !== activityId) continue;
    const outcome = conversationActivityOutcome(event);
    return outcome === "failed" || outcome === "waiting" ? conversationActivityHeadline(event.subject.kind, outcome) : null;
  }
  return null;
}
