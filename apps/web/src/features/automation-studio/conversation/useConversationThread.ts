"use client";

// Everything the conversation does that is not drawing: which thread is open,
// which turns are held, when to read again, and what happens when the person
// replies or answers.
//
// Three refresh paths, and they are the three the panel already uses. The
// mutation bus carries a change this tab caused, synchronously. The backoff
// poller carries a change a server-side run caused, which is the only way it
// can arrive at all. And a monotonic request counter plus an `AbortController`
// per detail read means a slow answer never overwrites a newer one.
//
// **A thread carries its own project.** The list may be read across every
// project the person can see, so the project a detail read or a reply belongs
// to is the selected conversation's own `projectId`, never the surface's idea
// of where the person is standing.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { subscribeToAutomationStudioMutations } from "../stores";
import type { ConversationCommands } from "./conversation-host";
import { conversationCapabilityArguments, type ConversationOnScreen } from "./instruction-commands";
import { commitConversationChanged } from "./turn-commands";
import { CONVERSATION_LIST_PAGE_SIZE, CONVERSATION_TURN_PAGE_SIZE } from "./turn-queries";
import {
  CONVERSATION_PANEL_CAPABILITY_ATTACHMENT,
  conversationPanelInvocation,
  createBackoffPoller,
  latestConversationTurnId,
  mergeConversationTurns,
  parseConversation,
  parseConversations,
  pendingConversationTurn,
  sortConversationsForThreadList,
  unansweredConversationCount,
  type Conversation,
  type ConversationAnswer,
  type ConversationPollOutcome,
  type ConversationTurn
} from "./thread";

export type ConversationThreadInput = {
  projectId: string | null;
  commands: ConversationCommands;
  /** False while the surface is closed; the poll drops to its idle beat, the state stays. */
  active?: boolean;
  requestedConversationId?: string;
  /** What the panel has open, sent with every message so "run it" means the Flow on screen. */
  onScreen?: ConversationOnScreen;
  onSelectedConversationChange?(conversationId: string): void;
};

export type ConversationThreadState = {
  conversations: Conversation[];
  conversation: Conversation | null;
  selectedConversationId: string;
  turns: ConversationTurn[];
  pendingTurn: ConversationTurn | null;
  /** How many threads are holding a question nobody has answered. */
  unanswered: number;
  loading: boolean;
  sending: boolean;
  error: string;
  /** True once a list read has come back, so "no threads" can be told from "not read yet". */
  loaded: boolean;
  selectConversation(conversationId: string): void;
  /**
   * Open a thread about this project and select it. False when there is no
   * project to open one on, or Core refused; the reason is on `error`.
   */
  startConversation(): Promise<boolean>;
  sendReply(text: string): Promise<boolean>;
  sendAnswer(answer: ConversationAnswer, authorizationPin?: string): Promise<boolean>;
  refresh(): void;
};

export function useConversationThread(input: ConversationThreadInput): ConversationThreadState {
  const { commands, projectId } = input;
  const active = input.active !== false;
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState(input.requestedConversationId ?? "");
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const listRequestRef = useRef(0);
  const failuresRef = useRef({ list: 0, detail: 0 });
  const detailRequestRef = useRef(0);
  const turnsRef = useRef<ConversationTurn[]>([]);
  const selectedRef = useRef(selectedConversationId);
  const projectByConversationRef = useRef(new Map<string, string>());
  const pollerRef = useRef<{ sync(): void } | null>(null);
  const onScreenRef = useRef<ConversationOnScreen>({});
  const onSelected = input.onSelectedConversationChange;
  onScreenRef.current = input.onScreen ?? {};

  turnsRef.current = turns;
  selectedRef.current = selectedConversationId;

  useEffect(() => {
    setConversations([]);
    setConversation(null);
    setTurns([]);
    setLoaded(false);
    projectByConversationRef.current = new Map();
    setSelectedConversationId(input.requestedConversationId ?? "");
    listRequestRef.current += 1;
    detailRequestRef.current += 1;
  }, [input.requestedConversationId, projectId]);

  // One failed read is not news on a surface that reads every few seconds:
  // opening a project races its own schema migration, and a panel that shouted
  // about it left a red box on screen for the rest of the session. The second
  // consecutive failure of the same read is a real problem and does speak.
  //
  // The two reads count separately. Sharing one counter let a detail read that
  // failed every time stay silent, because the list read succeeding in between
  // kept resetting it.
  const reportFailure = useCallback((source: "list" | "detail", message: string) => {
    failuresRef.current[source] += 1;
    if (failuresRef.current[source] > 1) setError(message);
  }, []);
  const clearFailures = useCallback((source: "list" | "detail") => {
    failuresRef.current[source] = 0;
    if (!failuresRef.current.list && !failuresRef.current.detail) setError("");
  }, []);

  /** The project a read or a write about this thread belongs to. */
  const projectFor = useCallback((conversationId: string): string => (
    projectByConversationRef.current.get(conversationId) ?? projectId ?? ""
  ), [projectId]);

  const readConversations = useCallback(async (): Promise<boolean> => {
    const generation = ++listRequestRef.current;
    const result = await commands.listConversations({ projectId, limit: CONVERSATION_LIST_PAGE_SIZE });
    if (generation !== listRequestRef.current) return false;
    if (!result.ok) {
      reportFailure("list", result.error ?? "The conversations could not be read.");
      setLoaded(true);
      return false;
    }
    const next = sortConversationsForThreadList(parseConversations(result.payload?.conversations));
    projectByConversationRef.current = new Map(next.map((entry) => [entry.conversationId, entry.projectId]));
    setConversations(next);
    setLoaded(true);
    clearFailures("list");
    if (!selectedRef.current && next.length) {
      selectedRef.current = next[0]!.conversationId;
      setSelectedConversationId(next[0]!.conversationId);
    }
    return true;
  }, [clearFailures, commands, projectId, reportFailure]);

  const readTurns = useCallback(async (options: { fromStart?: boolean; signal?: AbortSignal } = {}): Promise<ConversationPollOutcome> => {
    const conversationId = selectedRef.current;
    if (!conversationId) return "idle";
    const generation = ++detailRequestRef.current;
    const sinceTurnId = options.fromStart ? null : latestConversationTurnId(turnsRef.current);
    const result = await commands.loadConversation(
      {
        projectId: projectFor(conversationId),
        conversationId,
        limit: CONVERSATION_TURN_PAGE_SIZE,
        ...(sinceTurnId ? { sinceTurnId } : {})
      },
      options.signal
    );
    if (generation !== detailRequestRef.current || result.aborted) return "idle";
    if (!result.ok) {
      reportFailure("detail", result.error ?? "The conversation could not be read.");
      return "failed";
    }
    clearFailures("detail");
    if (result.page?.conversation) setConversation(result.page.conversation);
    const merged = mergeConversationTurns(options.fromStart ? [] : turnsRef.current, result.page?.turns ?? []);
    turnsRef.current = merged;
    setTurns(merged);
    return pendingConversationTurn(merged) ? "pending" : "idle";
  }, [clearFailures, commands, projectFor, reportFailure]);

  useEffect(() => {
    void readConversations();
  }, [readConversations]);

  useEffect(() => {
    if (!selectedConversationId) return;
    const controller = new AbortController();
    setLoading(true);
    turnsRef.current = [];
    setTurns([]);
    void readTurns({ fromStart: true, signal: controller.signal }).finally(() => setLoading(false));
    return () => controller.abort();
  }, [readTurns, selectedConversationId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // A closed dock still reads, on the hidden beat: the badge that tells
    // someone a question is waiting is the whole reason the dock is collapsed
    // rather than absent, and a surface that stops reading when it is closed
    // can never light it.
    const poller = createBackoffPoller<number>({
      // Always, not only when a thread is open. A project with no threads yet
      // is exactly the project a run is about to open one in, and gating the
      // poll on a selection meant that project never read again: the first
      // thread FluxIQ opened never appeared, and a transient failure on the
      // first read stayed on screen for the rest of the session.
      active: () => true,
      hidden: () => !active || (typeof document !== "undefined" && document.visibilityState === "hidden"),
      run: async () => {
        const listed = await readConversations();
        if (!selectedRef.current) return listed ? "idle" : "failed";
        return await readTurns();
      },
      schedule: (callback, delayMs) => window.setTimeout(callback, delayMs),
      cancel: (timer) => window.clearTimeout(timer)
    });
    pollerRef.current = poller;
    poller.sync();
    const resume = () => {
      if (document.visibilityState === "visible") poller.sync();
    };
    document.addEventListener("visibilitychange", resume);
    return () => {
      pollerRef.current = null;
      document.removeEventListener("visibilitychange", resume);
      poller.dispose();
    };
  }, [active, readConversations, readTurns]);

  useEffect(() => subscribeToAutomationStudioMutations(
    () => pollerRef.current?.sync(),
    { kinds: ["conversation.changed"], projectId: projectId ?? null }
  ), [projectId]);

  const selectConversation = useCallback((conversationId: string) => {
    selectedRef.current = conversationId;
    setSelectedConversationId(conversationId);
    onSelected?.(conversationId);
  }, [onSelected]);

  // A write is read back from the start, not from the cursor. A cursor read
  // only brings turns after the last one held, so an answer would settle an ask
  // on the server and leave its buttons on screen here: the turn the ask hangs
  // on is older than the cursor and would never be read again.
  const afterWrite = useCallback(async (conversationId: string) => {
    commitConversationChanged({ projectId: projectFor(conversationId), conversationId });
    await readTurns({ fromStart: true });
    void readConversations();
  }, [projectFor, readConversations, readTurns]);

  /**
   * Open a thread and select it, without touching `sending` - both callers own
   * that themselves, and one of them goes on to write into the thread it opened.
   *
   * Core continues a subject's open thread rather than minting a second one, so
   * this is safe to call whenever there is nothing selected.
   */
  const openThread = useCallback(async (): Promise<string> => {
    const project = projectId ?? "";
    if (!project) return "";
    const result = await commands.startConversation({ projectId: project });
    const opened = result.ok
      ? parseConversation((result.payload as { conversation?: unknown } | undefined)?.conversation)
      : null;
    if (!opened) {
      setError(result.error ?? "A new thread could not be started.");
      return "";
    }
    projectByConversationRef.current.set(opened.conversationId, opened.projectId);
    setError("");
    selectConversation(opened.conversationId);
    return opened.conversationId;
  }, [commands, projectId, selectConversation]);

  const startConversation = useCallback(async () => {
    if (sending) return false;
    setSending(true);
    try {
      const opened = await openThread();
      if (!opened) return false;
      await afterWrite(opened);
      return true;
    } finally {
      setSending(false);
    }
  }, [afterWrite, openThread, sending]);

  const sendReply = useCallback(async (text: string) => {
    if (!text.trim() || sending) return false;
    setSending(true);
    try {
      // Writing into a project that has no thread yet is asking for one, not an
      // error to report back. Opening it is what the person meant, and Core
      // continues an existing thread rather than adding a second.
      const conversationId = selectedRef.current || await openThread();
      if (!conversationId) return false;
      // Sent as an instruction: Core reads it with the panel's vocabulary,
      // answers in the thread, and the capability it chose runs here when it
      // is ordinary work. The result, success or failure, is written into the
      // thread by the time this returns.
      const result = await commands.sendInstruction({
        projectId: projectFor(conversationId),
        conversationId,
        text: text.trim(),
        onScreen: onScreenRef.current
      });
      if (!result.ok) {
        // Not stored: the words stay in the composer so nothing is lost.
        setError(result.error ?? "The reply could not be sent.");
        return false;
      }
      // Stored, even when the answer could not be written; the reason is shown.
      setError(result.problem ?? "");
      await afterWrite(conversationId);
      return true;
    } finally {
      setSending(false);
    }
  }, [afterWrite, commands, openThread, projectFor, sending]);

  /**
   * A confirmation Core raised before a delete or a payment, now granted: run
   * exactly the invocation it carried, with the PIN the person just gave.
   * Nothing else runs from an answer -- an ask Core raised for any other
   * reason carries no invocation and this does nothing for it.
   */
  const runConfirmed = useCallback(async (conversationId: string, askId: string, authorizationPin: string | undefined) => {
    const turn = turnsRef.current.find((entry) => entry.ask?.askId === askId);
    if (turn?.attachment?.kind !== CONVERSATION_PANEL_CAPABILITY_ATTACHMENT) return;
    const invocation = conversationPanelInvocation(turn);
    if (!invocation) {
      setError("That confirmation did not say what to run, so nothing was done. Ask for it again.");
      return;
    }
    await commands.runCapability({
      conversationId,
      request: { capabilityId: invocation.capabilityId, arguments: conversationCapabilityArguments(invocation.arguments) },
      context: { projectId: projectFor(conversationId), ...onScreenRef.current, ...(authorizationPin ? { authorizationPin } : {}) }
    });
  }, [commands, projectFor]);

  const sendAnswer = useCallback(async (answer: ConversationAnswer, authorizationPin?: string) => {
    const conversationId = selectedRef.current;
    if (!conversationId || sending) return false;
    setSending(true);
    try {
      const result = await commands.answerAsk({
        projectId: projectFor(conversationId),
        answer,
        ...(authorizationPin ? { authorizationPin } : {})
      });
      if (!result.ok) {
        setError(result.error ?? "The answer could not be sent.");
        return false;
      }
      setError("");
      if (answer.kind === "grant") await runConfirmed(conversationId, answer.askId, authorizationPin);
      await afterWrite(conversationId);
      return true;
    } finally {
      setSending(false);
    }
  }, [afterWrite, commands, projectFor, runConfirmed, sending]);

  const pendingTurn = useMemo(() => pendingConversationTurn(turns), [turns]);
  const unanswered = useMemo(() => unansweredConversationCount(conversations), [conversations]);

  return {
    conversations,
    conversation,
    selectedConversationId,
    turns,
    pendingTurn,
    unanswered,
    loading,
    loaded,
    sending,
    error,
    selectConversation,
    startConversation,
    sendReply,
    sendAnswer,
    refresh: () => pollerRef.current?.sync()
  };
}
