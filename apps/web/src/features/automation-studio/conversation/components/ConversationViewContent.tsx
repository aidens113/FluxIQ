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
import { Button, InlineNotice, LoadingState } from "../../../programs/components";
import { RefreshCw } from "lucide-react";
import type { ConversationCommands, ConversationViewHostCommands, ConversationViewHostModel } from "../conversation-host";
import { conversationSubjectDetail, conversationSubjectLabel } from "../thread";
import { useConversationThread } from "../useConversationThread";
import { ConversationComposer } from "./ConversationComposer";
import { ConversationOpeningMessage } from "./ConversationOpeningMessage";
import { ConversationThread } from "./ConversationThread";

export type ConversationViewProps = ConversationViewHostModel & ConversationViewHostCommands & {
  /** False while the surface is collapsed. The poll slows; the thread stays. */
  active?: boolean;
  /** Told how many threads are holding an unanswered question, so a collapsed shell can say so. */
  onWaitingChange?(waiting: number): void;
};

export function ConversationViewContent(props: ConversationViewProps & { commands: ConversationCommands }) {
  const thread = useConversationThread({
    projectId: props.projectId,
    commands: props.commands,
    ...(props.active === undefined ? {} : { active: props.active }),
    ...(props.requestedConversationId ? { requestedConversationId: props.requestedConversationId } : {}),
    ...(props.onSelectedConversationChange ? { onSelectedConversationChange: props.onSelectedConversationChange } : {})
  });

  const { onWaitingChange } = props;
  const waiting = thread.unanswered;
  useEffect(() => {
    onWaitingChange?.(waiting);
  }, [onWaitingChange, waiting]);

  const selected = thread.conversations.find((entry) => entry.conversationId === thread.selectedConversationId) ?? null;
  const nothingYet = thread.loaded && !thread.conversations.length;

  return (
    <section aria-label="Conversation" className="automation-conversation-view">
      <header className="automation-conversation-header">
        {thread.conversations.length > 1 ? (
          <label className="automation-conversation-picker">
            <span>Thread</span>
            <select
              value={thread.selectedConversationId}
              onChange={(event) => thread.selectConversation(event.target.value)}
            >
              {thread.conversations.map((conversation) => (
                <option key={conversation.conversationId} value={conversation.conversationId}>
                  {`${conversation.pendingAskCount > 0 ? "• " : ""}${conversationSubjectLabel(conversation)}`}
                </option>
              ))}
            </select>
          </label>
        ) : (
          // One thread needs no picker, but it still needs a name. Core's own
          // title reads as something a person recognises ("Checkout run"); the
          // subject underneath is the id, which is what they would quote in a
          // bug report and nothing they should have to read first.
          <div className="automation-conversation-title">
            <strong>{selected ? conversationSubjectLabel(selected) : "Conversation"}</strong>
            {selected ? <span>{conversationSubjectDetail(selected)}</span> : null}
          </div>
        )}
        <Button onClick={thread.refresh} size="compact" title="Read this thread again now">
          <RefreshCw aria-hidden size={13} />
          Refresh
        </Button>
      </header>
      {thread.error ? <InlineNotice message={thread.error} title="This thread could not be read" tone="error" /> : null}
      {nothingYet
        ? <ConversationOpeningMessage />
        : thread.loading && !thread.turns.length
          ? <LoadingState label="Reading the conversation" />
          : <ConversationThread
            busy={thread.sending}
            projectId={selected?.projectId ?? props.projectId ?? ""}
            turns={thread.turns}
            {...(props.active === undefined ? {} : { visible: props.active })}
            {...(thread.pendingTurn ? { pendingTurnId: thread.pendingTurn.turnId } : {})}
            {...(thread.error ? { error: thread.error } : {})}
            {...(props.commands.loadAttachment ? { loadAttachment: props.commands.loadAttachment } : {})}
            {...(props.onOpenAttachment ? { onOpenAttachment: props.onOpenAttachment } : {})}
            onAnswer={thread.sendAnswer}
          />}
      <ConversationComposer
        busy={thread.sending}
        disabled={!thread.selectedConversationId}
        {...(nothingYet
          ? { unavailableReason: "FluxIQ opens a thread as soon as a run, a build or a Flow has something to say. You can write in it from here the moment one exists." }
          : !thread.selectedConversationId
            ? { unavailableReason: "Pick a thread above to write in it." }
            : {})}
        onSend={thread.sendReply}
      />
    </section>
  );
}
