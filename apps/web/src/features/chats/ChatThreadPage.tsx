"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { ProgramChatWidget } from "../chat-widget";
import { PublishPanelPage, usePanelContext } from "../panel-shell";
import { chatHref } from "./chat-href";
import "./chats.css";

/** One chat as a full page, opened on its thread. Needs its project to find the thread. */
export function ChatThreadPage(props: { conversationId: string; projectId?: string }) {
  const router = useRouter();
  const { dispatch } = usePanelContext();
  const { projectId } = props;
  const shown = useRef(props.conversationId);
  // The page's own project is the one the assistant beside it follows, so the dock is a working chat and not a
  // second, disabled box asking for a project the person already has open.
  useEffect(() => {
    if (projectId) dispatch({ type: "project", projectId });
  }, [dispatch, projectId]);
  // A new chat started on this page is the page's chat now: the address names it, so a reload reopens it.
  const follow = (conversationId: string) => {
    if (!projectId || conversationId === shown.current) return;
    shown.current = conversationId;
    router.replace(chatHref(conversationId, projectId));
  };
  return (
    <div className="chats chats-thread">
      <PublishPanelPage page="chats" />
      <p className="chats-crumbs"><Link href="/chats">All chats</Link></p>
      {projectId ? (
        <div className="chats-thread-body">
          <ProgramChatWidget projectId={projectId} requestedConversationId={props.conversationId} onSelectedConversationChange={follow} />
        </div>
      ) : (
        <p className="chats-note" role="alert">This chat address has no project. Open it from the <Link href="/chats">chat list</Link>.</p>
      )}
    </div>
  );
}
