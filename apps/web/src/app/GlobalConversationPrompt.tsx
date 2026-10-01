"use client";

// A question FluxIQ asked, put in front of whoever is using the product.
//
// Why this exists at all. Nothing pushes to this browser: there is no
// `EventSource` and no client `WebSocket` in the panel, and the project change
// feed only moves when this tab itself causes a mutation. A turn written by a
// server-side run would therefore sit unread inside one tab of one view --
// which is exactly what already happened to the build-stage permission dialog,
// which has never once been observed in a live run.
//
// So this is mounted beside `GlobalClientGatewayPairing` in the root layout,
// the only mechanism in the product that has ever reached an unattended
// person, and it borrows that component's proven shape: a plain `fetch` rather
// than the Program API hook, which would pull `useSearchParams` into every
// route's root layout; an adaptive backoff, fast while something is pending
// and decaying to a ceiling while nothing is; a slow beat while the tab is
// hidden; and an immediate read when it becomes visible again.
//
// It imports the conversation's pure thread domain, never the Studio view: the
// view would ship its transcript, composer and re-authorization dialog into
// every route's first load, for a prompt that is a modal.
//
// It reads `list-conversations` for open threads, then `get-conversation` for
// bounded candidates and forward turn pages. It shows one question at a time, and
// answering or dismissing it reveals the next.
//
// **It stands down inside Automation Studio.** The conversation is an overlay
// there, always on screen and one press from being read in full, so a modal
// over the top of it would interrupt someone to tell them about a question
// their own chat window is already showing a badge for. This prompt is for the
// rest of the product, where there is no such window.

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Button, InlineNotice, Modal } from "../features/programs/shared-ui";
import {
  conversationAskPresentation,
  conversationPromptCopy,
  createBackoffPoller,
  openConversationsFromPayload,
  conversationAnswerRequest,
  parseConversationTurns,
  promptableConversationTurn,
  withDismissedAsk,
  type Conversation,
  type ConversationAnswer,
  type ConversationAnswerAction,
  type ConversationTurn
} from "../features/automation-studio/conversation/thread";

const PROGRAM_ENDPOINT = "/api/programs/automation-studio";
/** Where the conversation is an overlay already, so this prompt keeps quiet. */
const STUDIO_ROUTE = "/programs/automation-studio";
const CANDIDATE_LIMIT = 25;
const DETAIL_READ_LIMIT = 12;
const THREAD_PAGE_LIMIT = 3;

type PromptState = { conversation: Conversation | null; turn: ConversationTurn | null };
type PostResult = { ok: true; payload?: any } | { ok: false; error: string };

/**
 * A failure here is always an answer that says what could not be read, never
 * an empty one: "no conversations" and "the conversations could not be read"
 * lead to opposite decisions -- stay quiet, or keep asking -- and a prompt that
 * confused them would fall silent the moment the panel had a bad minute.
 */
async function programPost(endpoint: string, payload: Record<string, unknown>): Promise<PostResult> {
  let response: Response;
  try {
    response = await fetch(`${PROGRAM_ENDPOINT}/${endpoint}`, {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch {
    return { ok: false, error: `${endpoint} could not be reached.` };
  }
  if (response.status === 401 || response.status === 403) return { ok: false, error: `${endpoint} is not available to this account.` };
  let result: { ok?: boolean; payload?: unknown };
  try {
    result = await response.json() as { ok?: boolean; payload?: unknown };
  } catch {
    return { ok: false, error: `${endpoint} answered something this page could not read.` };
  }
  return response.ok && result.ok === true ? { ok: true, payload: result.payload } : { ok: false, error: `${endpoint} refused.` };
}

export function GlobalConversationPrompt() {
  const pathname = usePathname();
  const inStudio = Boolean(pathname?.startsWith(STUDIO_ROUTE));
  const [state, setState] = useState<PromptState>({ conversation: null, turn: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [readError, setReadError] = useState("");
  const dismissedRef = useRef<string[]>([]);
  const stateRef = useRef(state);
  const activeRef = useRef(false);
  const busyRef = useRef(false);
  const generationRef = useRef(0);
  const lifetimeRef = useRef(0);
  const candidateOffsetRef = useRef(0);
  const cursorsRef = useRef(new Map<string, { version: string; cursor: string | null }>());
  const pollerRef = useRef<{ sync(): void } | null>(null);

  const publish = (next: PromptState) => { stateRef.current = next; setState(next); };

  const read = useCallback(async () => {
    if (!activeRef.current || busyRef.current) return "pending" as const;
    const generation = ++generationRef.current;
    const current = () => activeRef.current && generation === generationRef.current;
    const failedMessage = "Questions could not be checked completely. Retry or open Automation Studio to review conversations.";
    const boundedMessage = "More conversations may contain questions. This prompt checks up to 25 conversations in bounded pages; open Automation Studio to review them now.";
    const list = await programPost("list-conversations", { projectId: null, status: "open", limit: CANDIDATE_LIMIT });
    if (!current()) return "failed" as const;
    if (!list.ok || !Array.isArray(list.payload?.conversations)) {
      setReadError(failedMessage);
      return "failed" as const;
    }
    const candidates = openConversationsFromPayload(list.payload).slice(0, CANDIDATE_LIMIT)
      .sort((left, right) => Number(right.pendingAskCount > 0) - Number(left.pendingAskCount > 0));
    const keys = new Set(candidates.map((entry) => `${entry.projectId}:${entry.conversationId}`));
    for (const key of cursorsRef.current.keys()) if (!keys.has(key)) cursorsRef.current.delete(key);
    const offset = candidateOffsetRef.current % Math.max(1, candidates.length);
    const ordered = [...candidates.slice(offset), ...candidates.slice(0, offset)];
    const selected = stateRef.current.conversation;
    if (selected) ordered.sort((left, right) => Number(right.conversationId === selected.conversationId && right.projectId === selected.projectId) - Number(left.conversationId === selected.conversationId && left.projectId === selected.projectId));
    let failed = false;
    let incomplete = candidates.length === CANDIDATE_LIMIT;
    let reads = 0;
    for (const conversation of ordered) {
      if (reads >= DETAIL_READ_LIMIT) { incomplete = true; break; }
      const key = `${conversation.projectId}:${conversation.conversationId}`;
      const revision = list.payload.conversations.find((entry: any) => entry?.projectId === conversation.projectId && entry?.conversationId === conversation.conversationId)?.revision;
      const version = `${conversation.updatedAt}:${Number.isSafeInteger(revision) ? revision : ""}`;
      const saved = cursorsRef.current.get(key);
      let cursor = saved?.version === version ? saved.cursor : null;
      for (let page = 0; page < THREAD_PAGE_LIMIT && reads < DETAIL_READ_LIMIT; page++) {
        reads++;
        const detail = await programPost("get-conversation", {
          projectId: conversation.projectId, conversationId: conversation.conversationId, limit: 100,
          ...(cursor ? { sinceTurnId: cursor } : {})
        });
        if (!current()) return "failed" as const;
        const envelope = detail.ok ? detail.payload?.conversation : null;
        if (!detail.ok || !Array.isArray(envelope?.turns)) {
          failed = true;
          cursorsRef.current.delete(key);
          break;
        }
        const turns = conversationTurnsFromDetail(detail.payload);
        const turn = promptableConversationTurn(turns.filter((entry) => !entry.ask || !dismissedRef.current.includes(entry.ask.askId)), dismissedRef.current);
        if (turn) {
          cursorsRef.current.set(key, { version, cursor });
          publish({ conversation, turn });
          setReadError(failed ? failedMessage : candidates.length === CANDIDATE_LIMIT ? boundedMessage : "");
          return "pending" as const;
        }
        const next = turns.at(-1)?.turnId;
        if (envelope.hasMore !== true) { cursorsRef.current.delete(key); break; }
        if (!next || next === cursor) { failed = true; cursorsRef.current.delete(key); break; }
        cursor = next;
        cursorsRef.current.set(key, { version, cursor });
        if (page === THREAD_PAGE_LIMIT - 1 || reads >= DETAIL_READ_LIMIT) incomplete = true;
      }
      candidateOffsetRef.current = (candidates.indexOf(conversation) + 1) % Math.max(1, candidates.length);
    }
    // An unreadable page does not prove a previously shown ask was resolved.
    if (!failed) publish({ conversation: null, turn: null });
    setReadError(failed ? failedMessage : incomplete ? boundedMessage : "");
    return failed ? "failed" as const : incomplete ? "pending" as const : "idle" as const;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || inStudio) return;
    activeRef.current = true;
    busyRef.current = false;
    publish({ conversation: null, turn: null });
    setError("");
    setReadError("");
    setBusy(false);
    const poller = createBackoffPoller<number>({
      active: () => true,
      hidden: () => document.visibilityState === "hidden",
      run: read,
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
      activeRef.current = false;
      ++generationRef.current;
      ++lifetimeRef.current;
      busyRef.current = false;
      stateRef.current = { conversation: null, turn: null };
      pollerRef.current = null;
      document.removeEventListener("visibilitychange", resume);
      poller.dispose();
    };
  }, [inStudio, read]);

  const turn = state.turn;
  const ask = turn?.ask ?? null;
  if (!inStudio && !turn && readError) return <aside role="status"><InlineNotice message={readError} tone="error" /><Button onClick={() => pollerRef.current?.sync()}>Retry</Button><a href={STUDIO_ROUTE}>Open conversations in Automation Studio</a></aside>;
  if (inStudio || !turn || !ask) return null;

  const presentation = conversationAskPresentation(ask);
  const copy = conversationPromptCopy(state.conversation, turn);
  const isCurrentQuestion = () => stateRef.current.conversation?.projectId === state.conversation?.projectId
    && stateRef.current.conversation?.conversationId === state.conversation?.conversationId
    && stateRef.current.turn?.ask?.askId === ask.askId;

  function dismiss() {
    if (busyRef.current || !ask || !activeRef.current || !isCurrentQuestion()) return;
    ++generationRef.current;
    dismissedRef.current = withDismissedAsk(dismissedRef.current, ask.askId);
    publish({ conversation: null, turn: null });
    setError("");
    pollerRef.current?.sync();
  }

  async function answer(action: ConversationAnswerAction) {
    if (busyRef.current || !turn || !activeRef.current || !isCurrentQuestion() || action.answer.askId !== ask?.askId) return;
    busyRef.current = true;
    const lifetime = lifetimeRef.current;
    ++generationRef.current;
    setBusy(true);
    setError("");
    try {
      const sent = await programPost("answer-ask", {
        projectId: state.conversation?.projectId ?? "",
        ...conversationAnswerRequest(action.answer satisfies ConversationAnswer)
      });
      if (!activeRef.current || lifetime !== lifetimeRef.current) return;
      if (!sent.ok) {
        setError("The answer could not be sent. The question is still waiting.");
        return;
      }
      dismissedRef.current = withDismissedAsk(dismissedRef.current, action.answer.askId);
      publish({ conversation: null, turn: null });
      busyRef.current = false;
      pollerRef.current?.sync();
    } finally {
      if (activeRef.current && lifetime === lifetimeRef.current) { busyRef.current = false; setBusy(false); }
    }
  }

  return (
    <Modal busy={busy} closeOnEscape={!busy} description={copy.description} title={copy.title} onClose={dismiss}>
      <div className="dialog-form">
        <strong>{presentation.title}</strong>
        {turn.text ? <p>{turn.text}</p> : null}
        {presentation.consequencePhrases.length ? (
          <ul aria-label="Consequences requiring approval">
            {presentation.consequencePhrases.map((phrase) => <li key={phrase}>{phrase}</li>)}
          </ul>
        ) : null}
        {presentation.takesText || presentation.actions.some((action) => action.destructive) ? (
          <InlineNotice
            message="Open this project in Automation Studio and answer it in the conversation window, where the question is in full and the answer is re-authorized."
            tone="info"
          />
        ) : null}
        {error ? <InlineNotice message={error} title="Answer not sent" tone="error" /> : null}
        {readError ? <InlineNotice message={readError} title="Question checks incomplete" tone="error" /> : null}
        {readError ? <a href={STUDIO_ROUTE}>Open conversations in Automation Studio</a> : null}
      </div>
      <div className="modal-actions">
        <Button disabled={busy} onClick={dismiss}>Not now</Button>
        {presentation.actions.filter((action) => !action.destructive).map((action) => (
          <Button
            busy={busy}
            data-modal-submit
            key={action.actionId}
            onClick={() => void answer(action)}
            variant={action.variant}
          >
            {action.label}
          </Button>
        ))}
      </div>
    </Modal>
  );
}

/**
 * Core answers a detail read as `{ conversation: { conversation, turns } }`.
 * Reading `payload.turns` finds nothing, which is a prompt that never fires
 * however many questions are waiting.
 */
function conversationTurnsFromDetail(payload: unknown): ConversationTurn[] {
  const envelope = payload && typeof payload === "object" ? (payload as { conversation?: unknown }).conversation : undefined;
  const turns = envelope && typeof envelope === "object" ? (envelope as { turns?: unknown }).turns : undefined;
  return parseConversationTurns(turns);
}
