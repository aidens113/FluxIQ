"use client";

import Link from "next/link";
import { ProgramChatWidget } from "../chat-widget";
import { PublishPanelPage } from "../panel-shell";
import "./chats.css";

/** One chat as a full page, opened on its thread. Needs its project to find the thread. */
export function ChatThreadPage(props: { conversationId: string; projectId?: string }) {
  return (
    <div className="chats chats-thread">
      <PublishPanelPage page="chats" />
      <p className="chats-crumbs"><Link href="/chats">All chats</Link></p>
      {props.projectId ? (
        <div className="chats-thread-body">
          <ProgramChatWidget projectId={props.projectId} requestedConversationId={props.conversationId} />
        </div>
      ) : (
        <p className="chats-note" role="alert">This chat address has no project. Open it from the <Link href="/chats">chat list</Link>.</p>
      )}
    </div>
  );
}
