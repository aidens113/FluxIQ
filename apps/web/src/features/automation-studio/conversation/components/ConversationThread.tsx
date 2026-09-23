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

import { useLayoutEffect, useRef, useState } from "react";
import { Button, EmptyState } from "../../../programs/components";
import { ArrowDown, MessagesSquare, TriangleAlert } from "lucide-react";
import type { ConversationCommands } from "../conversation-host";
import {
  conversationFollowsTail,
  visibleConversationTurns,
  type ConversationAnswer,
  type ConversationTurn as ConversationTurnRecord
} from "../thread";
import { ConversationTurn } from "./ConversationTurn";

export function ConversationThread(props: {
  turns: readonly ConversationTurnRecord[];
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

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const grew = props.turns.length > lastCountRef.current;
    lastCountRef.current = props.turns.length;
    if (!grew) return;
    if (followRef.current) {
      list.scrollTop = list.scrollHeight;
      setBehind(false);
      return;
    }
    setBehind(true);
  }, [props.turns.length]);

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

  if (!props.turns.length) {
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
        {visible.map((turn) => (
          <li data-turn-id={turn.turnId} key={turn.turnId}>
            <ConversationTurn
              busy={props.busy}
              projectId={props.projectId}
              turn={turn}
              {...(props.error ? { error: props.error } : {})}
              {...(props.loadAttachment ? { loadAttachment: props.loadAttachment } : {})}
              {...(props.onOpenAttachment ? { onOpenAttachment: props.onOpenAttachment } : {})}
              onAnswer={props.onAnswer}
            />
          </li>
        ))}
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
