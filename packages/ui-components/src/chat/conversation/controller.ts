// What the conversation card knows, and every request it makes. No DOM, so
// each rule below is tested directly.
//
// The conversation belongs to FluxIQ Core (UI audit, section 4, principle 6).
// This holds only what is on screen -- the end of the target's open thread,
// as Core last answered it -- plus whether a send or an answer is in flight.
// There are no model calls or merging: after a send or an answer the thread
// is read again and what Core says replaces what was shown.
//
// The one local turn is the message being sent (U5 of the
// run-musp39u8-9ac026ab UI review: it sat in the composer, with no bubble, for
// as long as FluxIQ took to answer the send). From the moment it is sent,
// `turns` ends with it as a person turn of this panel's own (`local-send:` id)
// until a read of Core's thread holds a person turn it had not held at send,
// or, failing that recognition, until the first good read after the send went
// through. A send that fails keeps it, with `sendError` saying why on the turn
// itself, until the person sends again, the target changes or the connection
// drops. A send refused before it starts (an empty body, another on its way, a
// scoped chat not ready) makes no turn.
//
// Which thread: the target's (`thread-requests.ts`): the project's own open
// thread, the open thread about one automation, or one thread by its id
// (`kind: "thread"`, chosen from the thread list), which is read directly,
// without listing, and always, since no list gives its revision here. A read happens when the card is
// shown, after each send and answer, and on a timer while it is visible; a
// thread whose `revision` has not moved is not read again. Changing the target
// forgets the thread on screen at once, and a read still on its way for the
// old target lands nowhere, so one thread's turns never show under another's
// name. A send already on its way still goes where it was written.
//
// A failed read is not shown at once. FluxIQ is busy during a build and a
// single read can fail and succeed a second later (a worker restart, a Core
// that briefly answers with an error), so a failure keeps what is on screen
// and reads again quietly (`read/retry.ts`). Only a failure that lasts sets
// `readError`, a notice naming the step and the cause (`read/failure.ts`),
// and `retry()` reads again at once. The poll keeps
// reading meanwhile, and the next good read clears the notice.
//
// A send FluxIQ did not answer in time (`timed_out`) is different: FluxIQ may
// well have the message, so the turn shows the background's sentence saying
// so, the thread is read, and a read that holds a person turn it had not held
// replaces the panel's turn as for a send that went.
//
// A send or an answer Core took can still report a `problem` (something after it
// went wrong); it shows as `notice` until the next send, answer or target change.
// An answer made with the person's PIN (`extra.authorizationPin`) passes it on
// to the transport and keeps it nowhere: not in state, errors or the outcome.
//
// Errors end with their cause. A send error clears when the person sends
// again; the read notice, the send error and every answer error when the
// connection drops, because the composer is disabled then and "Try again"
// would be advice nobody can take. An answer error clears when the question is
// no longer waiting.
//
// Two failures turn the card into its "Talk to FluxIQ in the FluxIQ window."
// fallback, because trying again from here cannot help:
//   unsupported  this client's transport cannot carry the request (the
//                extension's background does not know the message); it
//                lasts as long as the card is mounted
//   refused      FluxIQ refused this browser's token (`code: "refused"`, an
//                older FluxIQ that takes only its own login); it lasts until the
//                connection drops, since pairing again reconnects
// Every other failure keeps what was on screen: a read retries as above, and a
// send or an answer shows its sentence.

import type { ChatConversationPort, ChatResult } from "../ports/index.ts";
import type { ChatTarget } from "../target.ts";
import { sameThread } from "../same-thread.ts";
import type { AnswerOutcome } from "./answer-outcome.ts";
import { parseConversation, type CoreConversation, type CoreTurn } from "./core-thread.ts";
import { problemOf } from "./problem-of.ts";
import { READ_RETRY, readFailureNotice, UNREADABLE_CODE, type ConversationClock, type ThreadReadStep } from "./read/index.ts";
import { threadListRequest, threadSendRequest } from "./thread-requests.ts";
import { ALL_TURNS, readThreadTail, TURN_WINDOW } from "./thread-tail.ts";

/** Which of the card's faces shows. */
export type ConversationMode = "fallback" | "offline" | "loading" | "empty" | "thread";

/** Why the card shows its fallback. */
export type ConversationFallbackReason = "unsupported" | "refused";

/** Everything the card renders. */
export type ConversationState = {
  mode: ConversationMode;
  /** Set exactly when `mode` is `fallback`. */
  fallbackReason?: ConversationFallbackReason | undefined;
  turns: readonly CoreTurn[];
  /** The thread on screen, once there is one. */
  conversationId?: string | undefined;
  /** Explicit chat scope, independent of the browser's recording session. */
  projectId?: string | undefined;
  /** Ready follows an authorized scoped read, including an empty project thread. */
  scopeState?: "loading" | "ready" | "error" | undefined;
  /** Set only once reading has kept failing: what failed, and why. */
  readError?: string | undefined;
  /** A read is on its way. */
  reading: boolean;
  sending: boolean;
  sendError?: string | undefined;
  /** Something went wrong after a send or an answer Core took: its `problem`, until the next one or a new target. */
  notice?: string | undefined;
  /** True while turns before the first one on screen exist and are not shown. Absent reads as false. */
  earlierTurns?: boolean | undefined;
  /** How many turns those are, when known. */
  earlierCount?: number | undefined;
  /** Asks whose answer is on its way. */
  answering: ReadonlySet<string>;
  /** Why an answer did not go, by ask. */
  answerErrors: ReadonlyMap<string, string>;
};

export type ConversationController = {
  state(): ConversationState;
  /** Shows `target`'s thread from now on, and reads it. The same thread again (a renamed automation) keeps what is on screen. */
  setTarget(target: ChatTarget): void;
  /** Tells it whether FluxIQ is connected. Becoming connected reads the thread. */
  setConnected(connected: boolean): void;
  /** Reads the thread again when it may have changed. Never rejects. */
  refresh(): Promise<void>;
  /** The person's "Retry": reads at once, and quiet retries start over if it fails again. Never rejects. */
  retry(): Promise<void>;
  /** Sends `text` as the person's turn. Answers true once it went, so the composer can empty. */
  send(text: string, recordingId?: string): Promise<boolean>;
  /**
   * Answers a question FluxIQ asked, and says how it came out. `authorizationPin`
   * goes to the transport with this one answer and is held nowhere.
   */
  answer(askId: string, kind: string, value?: string, extra?: { authorizationPin?: string }): Promise<AnswerOutcome>;
  /** Reads the thread on screen from its start, without a window, and keeps every turn. */
  showEarlier(): Promise<void>;
};

/** What a host may change about how the card reads. */
export type ConversationReach = {
  /** Turns kept per thread instead of `TURN_WINDOW`. */
  window?: number;
  /**
   * Asked when the latest chat has no project: the card then has nowhere to
   * look. `"waiting"`: the thread list has not been read, so nothing is
   * known yet; `"empty"`: it has, and holds no thread. Undefined reads as
   * today, by listing the open thread.
   */
  withoutProject?: () => "waiting" | "empty" | undefined;
  /** True while the chat is out of sight: a read waits until it is asked for again. */
  quiet?: () => boolean;
};

const SYSTEM_CLOCK: ConversationClock = {
  now: () => Date.now(),
  schedule: (run, ms) => {
    const handle = setTimeout(run, ms);
    return () => clearTimeout(handle);
  }
};

/** A request the transport answered with a failure. */
type Failed = Extract<ChatResult<unknown>, { ok: false }>;

const UNREADABLE_LIST: Failed = {
  ok: false,
  sentence: "FluxIQ answered with a list of chats this panel can't read.",
  code: UNREADABLE_CODE
};

const SEND_FAILED = "Couldn't send that. Try again.";
/** The transport's code for a call FluxIQ did not answer in time. */
const TIMED_OUT = "timed_out";
const ANSWER_FAILED = "Couldn't send your answer. Try again.";
const NOT_ANSWERABLE: AnswerOutcome = { ok: false, error: "That question is not waiting for an answer here." };

/**
 * The person's message on its way or not sent, the turns Core held when it was
 * sent, and, once Core took it, how many reads had started by then.
 * `unanswered` marks a send FluxIQ did not answer in time: it may still have
 * the message, so a read that holds it replaces the panel's turn.
 */
type Outgoing = { turn: CoreTurn; known: ReadonlySet<string>; deliveredAfterRead?: number; unanswered?: true };

type Shown = { conversationId: string; projectId: string; revision: number | undefined };

/** Creates the controller. `onChange` is called after every change to `state()`. */
export function createConversationController(
  conversation: ChatConversationPort,
  onChange: () => void,
  clock: ConversationClock = SYSTEM_CLOCK,
  reach: ConversationReach = {}
): ConversationController {
  let fallback: ConversationFallbackReason | undefined;
  let target: ChatTarget = { kind: "latest" };
  // Bumped by every target change; an answer that arrives for an older one is dropped.
  let generation = 0;
  let connected = false;
  let loaded = false;
  let scopeState: "loading" | "ready" | "error" = "loading";
  let shown: Shown | undefined;
  let anchorTurnId: string | undefined;
  // How many turns come before the anchor, when known; and the thread whose every turn is wanted.
  let earlier: number | undefined;
  let everyTurnOf: string | undefined;
  let turns: readonly CoreTurn[] = [];
  let readError: string | undefined;
  let sending = false;
  let sendError: string | undefined;
  let notice: string | undefined;
  // The message on its way or not sent, shown as the person's turn.
  let outgoing: Outgoing | undefined;
  let outgoingCount = 0;
  // Reads started; reads run one at a time, so the newest is the one settling.
  let readsStarted = 0;
  const answering = new Map<string, object>();
  const answerErrors = new Map<string, string>();
  let inFlight: Promise<void> | undefined;
  /** The generation the read in flight is for. An older one is thrown away when it lands, so nothing waits for it. */
  let inFlightGeneration = -1;
  let again = false;
  // Failed reads in a row, since when, and the quiet retry waiting to run.
  let failing: { since: number; count: number } | undefined;
  let retriesUsed = 0;
  let cancelRetry: (() => void) | undefined;

  // A transport answers failures rather than throwing; one that throws anyway is a failed request.
  async function safely<T>(call: () => Promise<ChatResult<T>>): Promise<ChatResult<T>> {
    try {
      return await call();
    } catch {
      return { ok: false, sentence: "Couldn't reach FluxIQ. Try again.", code: "failed" };
    }
  }

  function failed(result: Failed, sentence: string, set: (sentence: string) => void): void {
    if (result.unsupported) {
      fallback = "unsupported";
    } else if (result.code === "refused") {
      fallback ??= "refused";
    } else {
      set(sentence);
    }
  }

  /** A read failed at `step`: retry quietly, and show the notice only once it has lasted. */
  function readFailed(step: ThreadReadStep, result: Failed): void {
    scopeState = "error";
    if (result.unsupported || result.code === "refused") {
      return failed(result, "", () => undefined);
    }
    const at = clock.now();
    failing = { since: failing?.since ?? at, count: (failing?.count ?? 0) + 1 };
    const lasted = failing.count >= READ_RETRY.noticeAfterFailures && at - failing.since >= READ_RETRY.noticeAfterMs;
    // Once shown, the notice follows the newest cause until a read succeeds.
    if (lasted || readError !== undefined) {
      readError = readFailureNotice(step, result);
    }
    scheduleRetry();
  }

  function scheduleRetry(): void {
    if (cancelRetry !== undefined || retriesUsed >= READ_RETRY.delaysMs.length) {
      return;
    }
    const delay = READ_RETRY.delaysMs[retriesUsed]!;
    retriesUsed += 1;
    cancelRetry = clock.schedule(() => {
      cancelRetry = undefined;
      void controller.refresh();
    }, delay);
  }

  /** Forgets every failed read: after a good read, a new target or a dropped connection. */
  function clearReadFailure(): void {
    cancelRetry?.();
    cancelRetry = undefined;
    failing = undefined;
    retriesUsed = 0;
    readError = undefined;
  }

  async function readOnce(): Promise<void> {
    const asked = generation;
    readsStarted += 1;
    // A chosen thread is named by the target; the others are found by listing.
    const direct = target.kind === "thread";
    const nowhere = target.kind === "latest" && target.projectId === undefined ? reach.withoutProject?.() : undefined;
    if (nowhere === "waiting") {
      return;
    }
    if (nowhere === "empty") {
      return settle(undefined, undefined, [], undefined);
    }
    let latest: CoreConversation | undefined;
    if (target.kind === "thread") {
      latest = { conversationId: target.conversationId, projectId: target.projectId, revision: -1 };
    } else {
      const listed = await safely(() => conversation.listThreads(threadListRequest(target)));
      if (asked !== generation) {
        return;
      }
      if (!listed.ok) {
        return readFailed("list", listed);
      }
      const list = listed.value.conversations;
      if (!Array.isArray(list)) {
        return readFailed("list", UNREADABLE_LIST);
      }
      latest = list.length === 0 ? undefined : parseConversation(list[0]);
      if (list.length > 0 && latest === undefined) {
        return readFailed("list", UNREADABLE_LIST);
      }
      if (target.projectId !== undefined && latest !== undefined && latest.projectId !== target.projectId) {
        return readFailed("list", UNREADABLE_LIST);
      }
    }
    if (latest === undefined) {
      return settle(undefined, undefined, [], undefined);
    }
    const same = shown?.conversationId === latest.conversationId;
    if (!direct && same && shown?.revision === latest.revision) {
      return settle(shown, anchorTurnId, turns, earlier);
    }

    const tail = await readThreadTail((query) => safely(() => conversation.readThread(query)), {
      conversationId: latest.conversationId,
      projectId: latest.projectId,
      requireIdentity: target.projectId !== undefined,
      anchorTurnId: same ? anchorTurnId : undefined,
      window: everyTurnOf === latest.conversationId ? ALL_TURNS : reach.window ?? TURN_WINDOW,
      earlier: same ? earlier : undefined
    });
    if (asked !== generation) {
      return;
    }
    if (!tail.ok) {
      return readFailed("thread", tail);
    }
    if (tail.value.missing) {
      return target.projectId !== undefined ? readFailed("thread", UNREADABLE_LIST) : settle(undefined, undefined, [], undefined);
    }
    // An incomplete read leaves the revision unknown, so the next one carries on.
    settle({ ...latest, revision: tail.value.complete && !direct ? latest.revision : undefined }, tail.value.anchorTurnId, tail.value.turns, tail.value.earlier);
  }

  function settle(next: Shown | undefined, nextAnchor: string | undefined, nextTurns: readonly CoreTurn[], nextEarlier: number | undefined): void {
    shown = next;
    anchorTurnId = nextAnchor;
    earlier = nextEarlier;
    turns = nextTurns;
    loaded = true;
    scopeState = "ready";
    // Core's own record of the message replaces the panel's, once a read holds
    // it; and any good read begun after Core took the message replaces it even
    // when Core's turn was not recognised, so it can never linger.
    if (outgoing !== undefined && (outgoing.turn.sendError === undefined || outgoing.unanswered)) {
      const known = outgoing.known;
      const delivered = outgoing.deliveredAfterRead;
      if ((delivered !== undefined && readsStarted > delivered) || nextTurns.some((turn) => turn.author === "person" && !known.has(turn.turnId))) {
        // A send that ran out of time turned out to have gone: its sentence goes with it.
        if (outgoing.unanswered) sendError = undefined;
        outgoing = undefined;
      }
    }
    clearReadFailure();
    const pending = new Set(nextTurns.flatMap((turn) => (turn.ask?.status === "pending" ? [turn.ask.askId] : [])));
    for (const askId of [...answerErrors.keys()]) {
      if (!pending.has(askId)) {
        answerErrors.delete(askId);
      }
    }
  }

  /** A send that did not go keeps its turn, saying why; a fallback says it for the whole card instead. */
  function keepFailed(mine: Outgoing): void {
    if (outgoing !== mine) {
      return;
    }
    outgoing = sendError === undefined ? undefined : { ...mine, turn: { ...mine.turn, sendError } };
  }

  function readable(): boolean {
    return connected && fallback === undefined;
  }

  const controller: ConversationController = {
    setTarget(next) {
      const same = sameThread(next, target);
      target = next;
      if (same) return;
      generation += 1;
      shown = undefined;
      anchorTurnId = undefined;
      earlier = undefined;
      turns = [];
      loaded = false;
      scopeState = "loading";
      clearReadFailure();
      sendError = undefined;
      notice = undefined;
      outgoing = undefined;
      answering.clear();
      answerErrors.clear();
      onChange();
      void controller.refresh();
    },
    state() {
      const shownTurns = outgoing === undefined ? turns : [...turns, outgoing.turn];
      const mode: ConversationMode = !connected ? "offline"
        : fallback !== undefined ? "fallback"
          : shownTurns.length > 0 ? "thread"
            : loaded && readError === undefined ? "empty"
              : "loading";
      return {
        mode,
        fallbackReason: fallback,
        turns: shownTurns,
        conversationId: shown?.conversationId,
        projectId: target.projectId !== undefined ? target.projectId : undefined,
        scopeState: target.projectId !== undefined ? (!connected || fallback !== undefined ? "error" : scopeState) : undefined,
        readError,
        reading: inFlight !== undefined,
        sending,
        sendError,
        notice,
        earlierTurns: anchorTurnId !== undefined,
        earlierCount: anchorTurnId === undefined ? undefined : earlier,
        answering: new Set(answering.keys()),
        answerErrors
      };
    },
    setConnected(next) {
      if (next === connected) return;
      connected = next;
      generation += 1;
      if (!next) {
        scopeState = "loading";
        if (fallback === "refused") fallback = undefined;
        clearReadFailure();
        sendError = undefined;
        notice = undefined;
        outgoing = undefined;
        answering.clear();
        answerErrors.clear();
      }
      onChange();
      if (next) void controller.refresh();
    },
    refresh() {
      if (!readable() || reach.quiet?.() === true) return Promise.resolve();
      if (inFlight && inFlightGeneration === generation) {
        again = true;
        return inFlight;
      }
      const mine = generation;
      inFlightGeneration = mine;
      again = false;
      inFlight = (async () => {
        do {
          again = false;
          await readOnce();
          // Left behind: the newer read owns `inFlight` and `again` now.
          if (mine !== generation) return;
          onChange();
        } while (again && readable());
        inFlight = undefined;
        onChange();
      })();
      return inFlight;
    },
    retry() {
      cancelRetry?.();
      cancelRetry = undefined;
      retriesUsed = 0;
      const reading = controller.refresh();
      onChange();
      return reading;
    },
    async send(text, recordingId) {
      const body = text.trim();
      if (body === "" || sending || !readable()) return false;
      if (target.projectId !== undefined && scopeState !== "ready") return false;
      sending = true;
      sendError = undefined;
      notice = undefined;
      outgoingCount += 1;
      const mine: Outgoing = { turn: { turnId: `local-send:${outgoingCount}`, author: "person", text: body, ask: null }, known: new Set(turns.map((turn) => turn.turnId)) };
      outgoing = mine;
      onChange();
      const asked = generation;
      const message = threadSendRequest(target, shown, body, recordingId);
      const result = await safely(() => conversation.send(message));
      if (asked !== generation) {
        // The person moved to another thread meanwhile; the message went to the one it was written in.
        sending = false;
        if (outgoing === mine) outgoing = undefined;
        onChange();
        return result.ok;
      }
      if (!result.ok && result.code === TIMED_OUT) {
        // FluxIQ stores a message before it reads it, so one it did not answer
        // in time (t613: a model provider that stalled) is probably in the
        // thread already, with its answer to come. The turn says what
        // happened, in the background's words, instead of "Sending your
        // message" for as long as the send was waiting, and the thread is
        // read: once it holds the message, Core's turn replaces this one.
        sending = false;
        sendError = result.sentence;
        if (outgoing === mine) outgoing = { ...mine, unanswered: true, turn: { ...mine.turn, sendError: result.sentence } };
        if (shown) shown = { ...shown, revision: undefined };
        onChange();
        await controller.refresh();
        return false;
      }
      if (!result.ok) {
        sending = false;
        failed(result, SEND_FAILED, (sentence) => (sendError = sentence));
        keepFailed(mine);
        onChange();
        return false;
      }
      notice = problemOf(result.value);
      const opened = parseConversation(result.value.conversation);
      if (target.projectId !== undefined && opened !== undefined && opened.projectId !== target.projectId) {
        scopeState = "error";
        sending = false;
        sendError = SEND_FAILED;
        keepFailed(mine);
        onChange();
        return false;
      }
      if (opened !== undefined && opened.conversationId !== shown?.conversationId) {
        // A first message opened a thread: show that one from its start.
        shown = { ...opened, revision: undefined };
        anchorTurnId = undefined;
      } else if (shown) {
        shown = { ...shown, revision: undefined };
      }
      // The send stays on its way until the thread holding it has been read
      // (U-B1). Ended here, a first message left the card with no turns, no
      // "Sending" line and nothing being sent for the length of that read, which
      // is the empty chat's own state: the welcome screen showed in the middle
      // of the build the message had just started, in every chat-driven Lab
      // run (`run-muq3ubys-4b4dbf5b`, `run-muq5vb5w-b50aaab7`,
      // `run-muq6mlom-2ae53681`).
      // Core has it: the next good read begun from here replaces the panel's turn (`settle`).
      if (outgoing === mine) outgoing = { ...mine, deliveredAfterRead: readsStarted };
      await controller.refresh();
      sending = false;
      onChange();
      return true;
    },
    showEarlier() {
      if (!readable() || shown === undefined || anchorTurnId === undefined) return Promise.resolve();
      everyTurnOf = shown.conversationId;
      anchorTurnId = undefined;
      shown = { ...shown, revision: undefined };
      return controller.refresh();
    },
    async answer(askId, kind, value, extra) {
      if (target.projectId !== undefined && scopeState !== "ready") return NOT_ANSWERABLE;
      const asking = turns.find((turn) => turn.ask?.askId === askId && turn.ask.status === "pending");
      if (answering.has(askId) || !readable() || !shown || asking === undefined) return NOT_ANSWERABLE;
      const asked = generation;
      const operation = {};
      answering.set(askId, operation);
      answerErrors.delete(askId);
      notice = undefined;
      onChange();
      // The turn that asked, for a client that must act on what it carries once the answer is taken.
      const turn = { conversationId: shown.conversationId, turnId: asking.turnId, ...(asking.attachment === undefined ? {} : { attachment: asking.attachment }) };
      const result = await safely(() => conversation.answer({
        askId,
        kind,
        value,
        projectId: shown?.projectId,
        turn,
        ...(extra?.authorizationPin === undefined ? {} : { authorizationPin: extra.authorizationPin })
      }));
      if (answering.get(askId) === operation) answering.delete(askId);
      if (!result.ok) {
        // A refused PIN is said by the host's dialog, which stays open on the outcome; the card does not say it twice.
        if (asked === generation) {
          failed(result, ANSWER_FAILED, (sentence) => { if (extra?.authorizationPin === undefined) answerErrors.set(askId, sentence); });
          onChange();
        }
        return { ok: false, error: result.sentence };
      }
      if (asked !== generation) return { ok: true };
      notice = problemOf(result.value);
      if (shown) shown = { ...shown, revision: undefined };
      onChange();
      await controller.refresh();
      return { ok: true };
    }
  };
  return controller;
}
