"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { ProgramChatWidget } from "../chat-widget";
import { PublishPanelPage, onScreenFromContext, usePanelContext } from "../panel-shell";
import { chatHref } from "./chat-href";
import "./chats.css";

/**
 * One chat as a full page, opened on its thread. `/chats/<conversationId>?project=<projectId>` is a
 * project's chat: the page makes that project the panel's (and so the person's current one in Core) and
 * opens the thread, which is how "Open in FluxIQ panel" from a client lands on the same conversation.
 * An address with no project is an earlier chat from before every chat had a project: it opens where it
 * lives, the person's own chats (the docked chat's list), never on a made-up project.
 */
export function ChatThreadPage(props: { conversationId: string; projectId?: string }) {
  const router = useRouter();
  const { dispatch, read } = usePanelContext();
  const { projectId } = props;
  const shown = useRef(props.conversationId);
  // The page's own project is the one the chat beside it follows, so the dock is a working chat and not a
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
  const earlier = useMemo(() => ({ onScreen: () => onScreenFromContext(read()) }), [read]);
  const projectFound = useCallback((found: string) => {
    if (read().projectId === undefined) dispatch({ type: "project", projectId: found });
  }, [read, dispatch]);
  return (
    <div className="chats chats-thread">
      <PublishPanelPage page="chats" />
      <p className="chats-crumbs"><Link href="/chats">All chats</Link></p>
      {projectId ? (
        <div className="chats-thread-body">
          <ProgramChatWidget projectId={projectId} requestedConversationId={props.conversationId} onSelectedConversationChange={follow} />
        </div>
      ) : (
        <>
          <p className="chats-note">This chat was started before every chat belonged to a project. You can still read and continue it here; a new chat goes into your project.</p>
          <div className="chats-thread-body">
            <ProgramChatWidget projectId={null} requestedConversationId={props.conversationId} panel={earlier} onProjectFound={projectFound} />
          </div>
        </>
      )}
    </div>
  );
}
