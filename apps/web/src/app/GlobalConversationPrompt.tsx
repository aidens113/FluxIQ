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
// It reads through the fixed conversation contract and nothing else:
// `list-conversations` for open threads, then `get-conversation` for the most
// recently updated one. It shows one question at a time, and answering or
// dismissing it reveals the next.

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, InlineNotice, Modal } from "../features/programs/shared-ui";
import {
  conversationAskPresentation,
  conversationPromptCopy,
  createBackoffPoller,
  openConversationsFromPayload,
  parseConversationTurns,
  promptableConversationTurn,
  withDismissedAsk,
  type Conversation,
  type ConversationAnswer,
  type ConversationAnswerAction,
  type ConversationTurn
} from "../features/automation-studio/conversation/thread";

const PROGRAM_ENDPOINT = "/api/programs/automation-studio";

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
  return result.ok === true ? { ok: true, payload: result.payload } : { ok: false, error: `${endpoint} refused.` };
}

export function GlobalConversationPrompt() {
  const [state, setState] = useState<PromptState>({ conversation: null, turn: null });
  const [dismissedAskIds, setDismissedAskIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dismissedRef = useRef<string[]>([]);
  const pollerRef = useRef<{ sync(): void } | null>(null);
  dismissedRef.current = dismissedAskIds;

  const read = useCallback(async () => {
    const list = await programPost("list-conversations", { projectId: null, status: "open", limit: 25, offset: 0 });
    if (!list.ok) return "failed" as const;
    const conversation = openConversationsFromPayload(list.payload)[0];
    if (!conversation) {
      setState({ conversation: null, turn: null });
      return "idle" as const;
    }
    const detail = await programPost("get-conversation", { conversationId: conversation.conversationId, limit: 100 });
    if (!detail.ok) return "failed" as const;
    const turn = promptableConversationTurn(parseConversationTurns(detail.payload?.turns), dismissedRef.current);
    setState({ conversation, turn });
    return turn ? ("pending" as const) : ("idle" as const);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
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
      pollerRef.current = null;
      document.removeEventListener("visibilitychange", resume);
      poller.dispose();
    };
  }, [read]);

  const turn = state.turn;
  const ask = turn?.ask ?? null;
  if (!turn || !ask) return null;

  const presentation = conversationAskPresentation(ask);
  const copy = conversationPromptCopy(state.conversation, turn);

  function dismiss() {
    if (busy || !ask) return;
    setDismissedAskIds((current) => withDismissedAsk(current, ask.askId));
    setState({ conversation: null, turn: null });
    pollerRef.current?.sync();
  }

  async function answer(action: ConversationAnswerAction) {
    if (busy || !turn) return;
    setBusy(true);
    setError("");
    try {
      const sent = await programPost("answer-ask", {
        conversationId: turn.conversationId,
        answer: action.answer satisfies ConversationAnswer
      });
      if (!sent.ok) {
        setError("The answer could not be sent. The question is still waiting.");
        return;
      }
      setState({ conversation: null, turn: null });
      pollerRef.current?.sync();
    } finally {
      setBusy(false);
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
            message="Open the Conversation view in Automation Studio to answer this one, where the answer can be checked and re-authorized."
            tone="info"
          />
        ) : null}
        {error ? <InlineNotice message={error} title="Answer not sent" tone="error" /> : null}
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
