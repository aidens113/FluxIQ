"use client";

// Everything the thread does that is not drawing: which conversation is open,
// which turns are held, when to read again, and what happens when the person
// replies or answers.
//
// Three refresh paths, and they are the three the panel already uses. The
// mutation bus carries a change this tab caused, synchronously. The backoff
// poller carries a change a server-side run caused, which is the only way it
// can arrive at all. And a monotonic request counter plus an `AbortController`
// per detail read means a slow answer never overwrites a newer one.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { subscribeToAutomationStudioMutations } from "../stores";
import type { ConversationCommands } from "./conversation-host";
import { commitConversationChanged } from "./turn-commands";
import { CONVERSATION_LIST_PAGE_SIZE, CONVERSATION_TURN_PAGE_SIZE } from "./turn-queries";
import {
  createBackoffPoller,
  latestConversationTurnId,
  mergeConversationTurns,
  parseConversation,
  parseConversations,
  parseConversationTurns,
  pendingConversationTurn,
  sortConversationsForThreadList,
  type Conversation,
  type ConversationAnswer,
  type ConversationPollOutcome,
  type ConversationTurn
} from "./thread";

export type ConversationThreadInput = {
  projectId: string | null;
  commands: ConversationCommands;
  /** False while the tab is asleep in the background; the poll stops, the state stays. */
  active?: boolean;
  requestedConversationId?: string;
  onSelectedConversationChange?(conversationId: string): void;
};

export type ConversationThreadState = {
  conversations: Conversation[];
  conversation: Conversation | null;
  selectedConversationId: string;
  turns: ConversationTurn[];
  pendingTurn: ConversationTurn | null;
  loading: boolean;
  sending: boolean;
  error: string;
  selectConversation(conversationId: string): void;
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
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const listRequestRef = useRef(0);
  const detailRequestRef = useRef(0);
  const turnsRef = useRef<ConversationTurn[]>([]);
  const selectedRef = useRef(selectedConversationId);
  const pollerRef = useRef<{ sync(): void } | null>(null);

  turnsRef.current = turns;
  selectedRef.current = selectedConversationId;

  useEffect(() => {
    setConversations([]);
    setConversation(null);
    setTurns([]);
    setSelectedConversationId(input.requestedConversationId ?? "");
    listRequestRef.current += 1;
    detailRequestRef.current += 1;
  }, [input.requestedConversationId, projectId]);

  const readConversations = useCallback(async (): Promise<boolean> => {
    if (!projectId) return false;
    const generation = ++listRequestRef.current;
    const result = await commands.listConversations({ projectId, limit: CONVERSATION_LIST_PAGE_SIZE, offset: 0 });
    if (generation !== listRequestRef.current) return false;
    if (!result.ok) {
      setError(result.error ?? "The conversations could not be read.");
      return false;
    }
    const next = sortConversationsForThreadList(parseConversations(result.payload?.conversations));
    setConversations(next);
    setError("");
    if (!selectedRef.current && next.length) {
      selectedRef.current = next[0]!.conversationId;
      setSelectedConversationId(next[0]!.conversationId);
    }
    return true;
  }, [commands, projectId]);

  const readTurns = useCallback(async (options: { fromStart?: boolean; signal?: AbortSignal } = {}): Promise<ConversationPollOutcome> => {
    const conversationId = selectedRef.current;
    if (!conversationId) return "idle";
    const generation = ++detailRequestRef.current;
    const sinceTurnId = options.fromStart ? null : latestConversationTurnId(turnsRef.current);
    const result = await commands.loadConversation(
      { conversationId, limit: CONVERSATION_TURN_PAGE_SIZE, ...(sinceTurnId ? { sinceTurnId } : {}) },
      options.signal
    );
    if (generation !== detailRequestRef.current || result.aborted) return "idle";
    if (!result.ok) {
      setError(result.error ?? "The conversation could not be read.");
      return "failed";
    }
    setError("");
    const parsed = parseConversation(result.payload?.conversation);
    if (parsed) setConversation(parsed);
    const incoming = parseConversationTurns(result.payload?.turns);
    const merged = mergeConversationTurns(options.fromStart ? [] : turnsRef.current, incoming);
    turnsRef.current = merged;
    setTurns(merged);
    return pendingConversationTurn(merged) ? "pending" : "idle";
  }, [commands]);

  useEffect(() => {
    if (!projectId) return;
    void readConversations();
  }, [projectId, readConversations]);

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
    const poller = createBackoffPoller<number>({
      active: () => active && Boolean(projectId) && Boolean(selectedRef.current),
      hidden: () => typeof document !== "undefined" && document.visibilityState === "hidden",
      run: async () => {
        const outcome = await readTurns();
        void readConversations();
        return outcome;
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
  }, [active, projectId, readConversations, readTurns, selectedConversationId]);

  useEffect(() => subscribeToAutomationStudioMutations(
    () => pollerRef.current?.sync(),
    { kinds: ["conversation.changed"], projectId: projectId ?? null }
  ), [projectId]);

  const selectConversation = useCallback((conversationId: string) => {
    selectedRef.current = conversationId;
    setSelectedConversationId(conversationId);
    input.onSelectedConversationChange?.(conversationId);
  }, [input]);

  const afterWrite = useCallback(async (conversationId: string) => {
    commitConversationChanged({ projectId, conversationId });
    await readTurns();
  }, [projectId, readTurns]);

  const sendReply = useCallback(async (text: string) => {
    const conversationId = selectedRef.current;
    if (!conversationId || !text.trim() || sending) return false;
    setSending(true);
    try {
      const result = await commands.appendTurn({ conversationId, text: text.trim() });
      if (!result.ok) {
        setError(result.error ?? "The reply could not be sent.");
        return false;
      }
      setError("");
      await afterWrite(conversationId);
      return true;
    } finally {
      setSending(false);
    }
  }, [afterWrite, commands, sending]);

  const sendAnswer = useCallback(async (answer: ConversationAnswer, authorizationPin?: string) => {
    const conversationId = selectedRef.current;
    if (!conversationId || sending) return false;
    setSending(true);
    try {
      const result = await commands.answerAsk({
        conversationId,
        answer,
        ...(authorizationPin ? { authorizationPin } : {})
      });
      if (!result.ok) {
        setError(result.error ?? "The answer could not be sent.");
        return false;
      }
      setError("");
      await afterWrite(conversationId);
      return true;
    } finally {
      setSending(false);
    }
  }, [afterWrite, commands, sending]);

  const pendingTurn = useMemo(() => pendingConversationTurn(turns), [turns]);

  return {
    conversations,
    conversation,
    selectedConversationId,
    turns,
    pendingTurn,
    loading,
    sending,
    error,
    selectConversation,
    sendReply,
    sendAnswer,
    refresh: () => pollerRef.current?.sync()
  };
}
