"use client";

// The conversation itself: which thread is open, what was said in it, and the
// two ways a person answers -- the ask in the turn that raised it, and the
// composer at the bottom.
//
// Commands arrive as props rather than from a hook, which is the split every
// Studio surface uses so a test can mount the content with doubles and drive
// it without a transport.
//
// **Nothing here is ever a dead control.** The composer used to be disabled
// whenever no thread was selected, which in a live panel meant permanently:
// the reads were failing, the list was empty, and the person was left with a
// text box they could not click and no word about why. A control that cannot
// be used now says what would make it usable, and when there is no thread at
// all the surface explains what this is instead of showing an empty frame.

import { useEffect } from "react";
import { InlineNotice, LoadingState } from "../../../programs/components";
import type { ConversationCommands, ConversationViewHostCommands, ConversationViewHostModel } from "../conversation-host";
import { conversationDisplayTitle, conversationSubjectLabel, type Conversation } from "../thread";
import { useConversationThread } from "../useConversationThread";
import { useConversationActivity, usePacedConversationActivity } from "../activity";
import { ConversationComposer } from "./ConversationComposer";
import { ConversationOpeningMessage } from "./ConversationOpeningMessage";
import { ConversationThread } from "./ConversationThread";

export type ConversationViewProps = ConversationViewHostModel & ConversationViewHostCommands & {
  /** False while the surface is collapsed. The poll slows; the thread stays. */
  active?: boolean;
  /** Told how many threads are holding an unanswered question, so a collapsed shell can say so. */
  onWaitingChange?(waiting: number): void;
  /**
   * Told the chat's name ("Company website", "Nightly listings run"), so a
   * shell with its own title bar can carry it there. When it is set, the view
   * draws no name of its own; it still draws the thread picker when there is
   * more than one thread.
   */
  onTitleChange?(title: string): void;
};

export function ConversationViewContent(props: ConversationViewProps & { commands: ConversationCommands }) {
  const thread = useConversationThread({
    projectId: props.projectId,
    commands: props.commands,
    ...(props.active === undefined ? {} : { active: props.active }),
    ...(props.requestedConversationId ? { requestedConversationId: props.requestedConversationId } : {}),
    ...(props.onScreen ? { onScreen: props.onScreen } : {}),
    ...(props.onSelectedConversationChange ? { onSelectedConversationChange: props.onSelectedConversationChange } : {})
  });

  const { onWaitingChange } = props;
  const waiting = thread.unanswered;
  useEffect(() => {
    onWaitingChange?.(waiting);
  }, [onWaitingChange, waiting]);

  const selected = thread.conversations.find((entry) => entry.conversationId === thread.selectedConversationId) ?? null;
  const title = conversationDisplayTitle(selected, props.projectName);
  const { onTitleChange } = props;
  useEffect(() => {
    onTitleChange?.(title);
  }, [onTitleChange, title]);
  const picker = thread.conversations.length > 1;
  const ownTitle = !onTitleChange;
  // Live activity is per project, so it follows the open thread's project, or
  // the surface's when nothing is open. Without a project there is none to read.
  const activity = useConversationActivity({
    projectId: selected?.projectId ?? props.projectId ?? null,
    commands: props.commands,
    ...(props.active === undefined ? {} : { active: props.active })
  });
  const activityProject = selected?.projectId ?? props.projectId;
  const paced = usePacedConversationActivity(activity.current, activityProject);
  // The live line is drawn only while the work is going or waits on the
  // person, and only in the thread it belongs to; once it settles, the step
  // messages and the answer say how it went.
  const current = activity.current;
  const ownThread = !current?.conversationId || !thread.selectedConversationId || current.conversationId === thread.selectedConversationId;
  const live = paced && ownThread && (paced.outcome === null || paced.outcome === "waiting") ? paced : null;
  const hasActivityRows = activity.events.some((event) => event.detail && event.detail.kind !== "note");
  const nothingYet = thread.loaded && !thread.conversations.length && !hasActivityRows && !live;
  // Writing with nothing selected opens a thread first, so the only state that
  // genuinely has nowhere to send is one with no project to open a thread on -
  // which is the dock mounted on the landing screen, before a project is picked.
  const canWrite = Boolean(thread.selectedConversationId || props.projectId);

  return (
    <section aria-label="Conversation" className="automation-conversation-view">
      {picker || ownTitle ? (
        <header className="automation-conversation-header">
          {picker ? (
            <label className="automation-conversation-picker">
              <span className="automation-conversation-sr">Thread</span>
              <select
                value={thread.selectedConversationId}
                onChange={(event) => thread.selectConversation(event.target.value)}
              >
                {threadOptions(thread.conversations).map((option) => (
                  <option key={option.conversationId} value={option.conversationId}>{option.label}</option>
                ))}
              </select>
            </label>
          ) : (
            // The thread's name, never its id: Core's title, else the project's
            // name (`thread/naming.ts`). The chat already polls and is pushed
            // to, so there is no "Refresh" beside it.
            <strong className="automation-conversation-title">{title}</strong>
          )}
        </header>
      ) : null}
      {thread.error ? <InlineNotice message={thread.error} title="This thread could not be read" tone="error" /> : null}
      {nothingYet
        ? <ConversationOpeningMessage />
        : thread.loading && !thread.turns.length
          ? <LoadingState label="Reading the conversation" />
          : <ConversationThread
            busy={thread.sending}
            projectId={selected?.projectId ?? props.projectId ?? ""}
            turns={thread.turns}
            activity={activity.events}
            live={live}
            {...(thread.selectedConversationId ? { conversationId: thread.selectedConversationId } : {})}
            {...(props.active === undefined ? {} : { visible: props.active })}
            {...(thread.pendingTurn ? { pendingTurnId: thread.pendingTurn.turnId } : {})}
            {...(thread.error ? { error: thread.error } : {})}
            {...(props.commands.loadAttachment ? { loadAttachment: props.commands.loadAttachment } : {})}
            {...(props.onOpenAttachment ? { onOpenAttachment: props.onOpenAttachment } : {})}
            onAnswer={thread.sendAnswer}
          />}
      {/*
        Writing with no thread selected opens one, so the composer is live
        wherever there is a project to open a thread on. Until Core registered
        `open-conversation` on 2026-09-28 nothing outside Core could start a
        thread at all, so this box was permanently disabled on a project that
        had not spoken yet - a control that could never work, in the one place
        the product asks people to talk to it.
      */}
      <ConversationComposer
        busy={thread.sending}
        disabled={!canWrite}
        {...(canWrite
          ? {}
          : { unavailableReason: "Open a project to start a conversation. FluxIQ also opens a thread by itself as soon as a run, a build or a Flow has something to say." })}
        onSend={thread.sendReply}
      />
    </section>
  );
}

/**
 * The picker's options: each thread's name, whether it is waiting on the
 * person, and, where two threads would read the same, when each last moved.
 */
function threadOptions(conversations: readonly Conversation[]): Array<{ conversationId: string; label: string }> {
  const labels = conversations.map((conversation) => conversationSubjectLabel(conversation));
  return conversations.map((conversation, index) => {
    const label = labels[index]!;
    const repeated = labels.indexOf(label) !== labels.lastIndexOf(label);
    const when = repeated
      ? ` · ${new Date(conversation.updatedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
      : "";
    const waiting = conversation.pendingAskCount > 0 ? " (waiting on you)" : "";
    return { conversationId: conversation.conversationId, label: `${label}${when}${waiting}` };
  });
}
