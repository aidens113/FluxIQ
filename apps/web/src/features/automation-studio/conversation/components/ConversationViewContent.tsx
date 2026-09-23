"use client";

// The conversation as a first-class Automation Studio view.
//
// Commands arrive as props rather than from a hook, which is the split every
// Studio view uses so a test can mount the content with doubles and drive it
// without a transport.

import { Button, InlineNotice, LoadingState } from "../../../programs/components";
import { RefreshCw } from "lucide-react";
import type { ConversationCommands, ConversationViewHostCommands, ConversationViewHostModel } from "../conversation-host";
import { conversationSubjectLabel } from "../thread";
import { useConversationThread } from "../useConversationThread";
import { ConversationComposer } from "./ConversationComposer";
import { ConversationThread } from "./ConversationThread";

export type ConversationViewProps = ConversationViewHostModel & ConversationViewHostCommands & {
  /** False while the tab sits warm in the background. The poll stops; the thread stays. */
  active?: boolean;
};

export function ConversationViewContent(props: ConversationViewProps & { commands: ConversationCommands }) {
  const thread = useConversationThread({
    projectId: props.projectId,
    commands: props.commands,
    ...(props.active === undefined ? {} : { active: props.active }),
    ...(props.requestedConversationId ? { requestedConversationId: props.requestedConversationId } : {}),
    ...(props.onSelectedConversationChange ? { onSelectedConversationChange: props.onSelectedConversationChange } : {})
  });

  if (!props.projectId) {
    return <section className="automation-conversation-view"><InlineNotice message="Open a project to see its conversations." tone="info" /></section>;
  }

  return (
    <section aria-label="Conversation" className="automation-conversation-view">
      <header className="automation-conversation-header">
        <label className="automation-conversation-picker">
          <span>Conversation</span>
          <select
            disabled={!thread.conversations.length}
            value={thread.selectedConversationId}
            onChange={(event) => thread.selectConversation(event.target.value)}
          >
            {thread.conversations.length
              ? thread.conversations.map((conversation) => (
                <option key={conversation.conversationId} value={conversation.conversationId}>
                  {`${conversationSubjectLabel(conversation)}${conversation.status === "open" ? "" : " (resolved)"}`}
                </option>
              ))
              : <option value="">No conversations yet</option>}
          </select>
        </label>
        <Button onClick={thread.refresh} size="compact" title="Read the thread again now">
          <RefreshCw aria-hidden size={13} />
          Refresh
        </Button>
      </header>
      {thread.pendingTurn
        ? <InlineNotice message="FluxIQ is waiting on an answer in this conversation." title="Waiting on you" tone="warning" />
        : null}
      {thread.error ? <InlineNotice message={thread.error} title="Conversation unchanged" tone="error" /> : null}
      {thread.loading && !thread.turns.length
        ? <LoadingState label="Reading the conversation" />
        : <ConversationThread
          busy={thread.sending}
          turns={thread.turns}
          {...(thread.error ? { error: thread.error } : {})}
          {...(props.commands.loadAttachment ? { loadAttachment: props.commands.loadAttachment } : {})}
          {...(props.onOpenAttachment ? { onOpenAttachment: props.onOpenAttachment } : {})}
          onAnswer={thread.sendAnswer}
        />}
      <ConversationComposer busy={thread.sending} disabled={!thread.selectedConversationId} onSend={thread.sendReply} />
    </section>
  );
}
