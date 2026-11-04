// The chat: a client's view of FluxIQ Core's conversation, the same
// thread FluxIQ's own chat shows, with FluxIQ's live activity in it. It fills
// the container the client gives it; the client's shell owns the top bar, the
// Open FluxIQ link and the settings, so the chat has no header. It reaches
// FluxIQ only through the `ChatTransport` the client passes in (`ports/`):
//
//   context   a slim line naming the automation, only in an automation's chat,
//             with the way back to the latest chat
//   stream    the scrolling conversation. The person's turns are bubbles on
//             the right; FluxIQ's are full-width formatted text. Every step
//             of FluxIQ's work is its own message on FluxIQ's side, in order:
//             what it did and why ("**Clicking “Get a free quote”** — The
//             quote form is behind this button, so I'm opening it."), with a
//             quiet line saying how the action went. No folds, no counts.
//             While FluxIQ works, a live line at the end says what it is
//             doing now ("Thinking about the next step"), updated in place
//   composer  pinned at the bottom: a growing box and a round send button
//
// Which thread (`open`): the latest -- the project's own open thread -- or one
// automation's thread, or the thread a build or a run put its question in.
// Sending goes to the thread on screen.
//
// A question is never left where nobody sees it. Core asks in the thread of
// the work's own subject (a build in its Flow's, a run in its own), which is
// often not the thread on screen: a run started from the automations tab asks
// in a thread no chat shows. So while the paced display says the work waits
// for the person, every chat shows the waiting live line, and when the
// question is in another thread the line's one button, "Show the question",
// opens that thread here (`stream/ask-thread.ts`), where its Continue and
// Stop (or its other answers) are the thread's own ask controls, answered
// through the same transport as any other. "‹ Latest chat" goes back.
//
// What is on screen comes from two owners and is merged only for display:
// the thread from `createConversationController` (Core's, read on a 4 s poll
// and 300 ms after an activity event that names a conversation or ends the
// work), and the activity from `createActivityFeed` (the client's,
// read on start and pushed after). Neither is written here. The live line
// renders the relay's paced `display` only; the step messages come from the
// relay's `history`, which holds each recent unit of work whole, so a long
// build's first decisions are still there after it settles, placed by time
// among the thread's turns.
//
// Under the stream, beside the composer: Stop for the work of the moment
// (`stop-control.ts`) and, for a run, Take over / Hand back (`hold-control.ts`).
// A run the shell followed here (`followRun`) is shown: when the thread on
// screen would not show its steps, the chat opens one that does
// (`stream/run-target.ts`), but not while the person types a message.
//
// A read that fails is retried quietly; only one that keeps failing shows the
// read notice, naming what failed, with a Retry (`conversation/read-notice.ts`).
//
// New content is followed only while the person is at the bottom; scrolled
// up, the view stays put and "Jump to latest" shows (`createScrollFollower`).
//
// Empty and connected, the latest chat is the onboarding (`view/empty-state-model.ts`):
// what FluxIQ does, "Describe what you want" (puts the caret in the composer,
// sends nothing) and "Extract data from this page" (`onExtract`: the shell
// shows the extraction sheet; offered only when the client passes it), and, when `onboarding/` reads that no model key
// is enabled, a line saying so with Open FluxIQ (`openControl`, when the client has
// one). The keys are read each time
// the empty latest chat comes on screen, and while they read missing, again on
// each poll and when the person turns to the composer; a failed read, or a client
// with no `models` port, says nothing.
//
// `fallback` (a client that cannot carry the conversation, or a FluxIQ that
// refuses this browser's token) swaps the stream and composer for "Talk to
// FluxIQ in the FluxIQ window." (or the client's own words, `options.fallback`);
// the shell's Open FluxIQ is the way there.
//
// With `options.threads` the chat holds Core's list of threads (`threads/`), not
// one; `setBackground` leaves only that list reading; `history` and `welcome`
// change how much of a thread is kept and what the empty chat says.

import { createElement } from "../dom/index.ts";
import type { ClientGatewayActivity } from "fluxiq/ui";
import { createRecordingAttachment } from "./attachment/index.ts";
import { createComposer, createConversationController, createReadNotice, type ConversationController } from "./conversation/index.ts";
import { createAnswerReader, type AnswerHost, type AnswerReader } from "./answer/index.ts";
import { createWorkHeaderView, meterOfOutcomes, type WorkMeter } from "./work-header/index.ts";
import { createActivityFeed, threadRefreshWanted } from "./feed/index.ts";
import { sameTarget } from "./same-target.ts";
import { sameThread } from "./same-thread.ts";
import { createHoldControl, createStopControl } from "./controls/index.ts";
import { createChatOwnerContext, type ChatOwner } from "./owner-context.ts";
import type { ChatHostStatus, ChatOpenControl, ChatRunPort, ChatTransport } from "./ports/index.ts";
import { readBeatMs } from "./read-beat.ts";
import { createChatThreads, type ChatThreads } from "./threads/index.ts";
import { modelReadinessLockReason, readModelReadiness, type ModelReadiness } from "./onboarding/index.ts";
import { activityForTarget, buildChatStream, CHAT_STEP_MESSAGE_LIMIT, createTurnClock, followedRunTarget, threadKey, type QuestionTarget } from "./stream/index.ts";
import type { ChatTarget } from "./target.ts";
import { CHAT_PROJECT_NAVIGATION, createProjectDraftOwner } from "./project-navigation/index.ts";
import {
  createContextLine,
  createEarlierTurns,
  createEmptyState,
  createNoticeLine,
  createPendingBanner,
  createScrollFollower,
  createThreadView,
  createTurnControls,
  emptyStateModel,
  handFocusOn,
  navigationVisible,
  showTurn
} from "./view/index.ts";

import type { ChatWidget, ChatWidgetOptions } from "./widget/index.ts";

export type { ChatWidget, ChatWidgetOptions };

const THREAD_REFRESH_DEBOUNCE_MS = 300;
/** How often an empty chat that read its key as fine reads it again, so a lock shows without reopening. */
const READY_RECHECK_MS = 15_000;

/** Creates the chat, talking to FluxIQ through `transport`. */
export function createChatWidget(transport: ChatTransport, options: ChatWidgetOptions = {}): ChatWidget {
  const onConversation = options.onConversation ?? (() => undefined);
  const showContext = options.contextLine !== false;
  let shownTarget: ChatTarget = { kind: "latest" };
  const targetListeners = new Set<(target: ChatTarget) => void>();
  const owners = createChatOwnerContext(transport, options.ownerKey);
  let owner = owners.capture();
  const draftOwners = createProjectDraftOwner();
  let controller: ConversationController = makeController(owner);
  let feed = makeFeed(owner);
  let clock = createTurnClock();
  let actionScope = {};
  let backScope = {};
  // True while the chat is out of sight: only the thread list reads (`setBackground`).
  let background = false;
  const threads: ChatThreads | undefined = options.threads === undefined || transport.conversation.listAllThreads === undefined
    ? undefined
    : createChatThreads({
      options: options.threads,
      list: (query) => owner.transport.conversation.listAllThreads!(query),
      projectId: () => latestStatus?.projectId,
      projectName: () => latestStatus?.projectName,
      target: () => shownTarget,
      open: (next) => open(next),
      busy: () => controller.state().sending,
      changed: () => {
        void controller.refresh();
        renderAll();
      }
    });
  const earlier = options.history === undefined ? undefined : createEarlierTurns(() => {
    if (actionsAllowed()) void controller.showEarlier();
  });

  const context = createContextLine(() => undefined);
  // The thread holding the question the work waits on, while it is not the one on screen.
  let answerIn: QuestionTarget | null = null;
  let reader: AnswerReader = makeReader(owner);
  // What the answer turns do through the host: exports and Run again go through the results port; the rest are the chat's own.
  const answerHost = (): AnswerHost => ({
    ...(owner.transport.results === undefined ? {} : { results: owner.transport.results }),
    onWhatIDid: () => {
      const first = thread.element.querySelector(".chat-step-line")?.closest("li") ?? undefined;
      showTurn(scroller, first ?? undefined);
    },
    onKeepGoing: () => { if (actionsAllowed()) void controller.send("Keep going."); },
    onTellMore: () => { if (actionsAllowed()) composer.focus(); },
    onStop: (attemptId) => {
      const attempt = reader.outcomes().find((outcome) => outcome.attempt.attemptId === attemptId)?.attempt;
      if (attempt === undefined || !actionsAllowed()) return;
      void owner.transport.runs.stop({ projectId: attempt.projectId, ...(attempt.runId === undefined ? {} : { runId: attempt.runId }) });
    },
    onChanged: () => void reader.read()
  });
  const threadOptions = () => ({ attachments: options.attachments, meta: options.turnMeta, answers: answerHost() });
  let thread = createThreadView(threadOptions());
  // The model-key line's Open FluxIQ, moved into each empty state the chat builds.
  const keyOpener = options.openControl?.({ label: "Open FluxIQ", look: "small", purpose: "model-key", canOpen: () => owner.current() && actionsAllowed() });
  let readiness: ModelReadiness = "unknown";
  let readinessAsk: object | null = null;
  let readinessAskedAtMs = 0;
  // The read of the keys on its way, if any, so typing never queues one per key press.
  let readinessReading: object | null = null;
  let empty = createEmptyState(() => undefined);
  let readNotice = createReadNotice(() => undefined);
  const notice = createNoticeLine();
  const columnParts = (): HTMLElement[] => [...(earlier === undefined ? [] : [earlier.element]), empty.element, thread.element, readNotice.element, notice.element];
  const column = createElement("div", { className: "chat-column" }, columnParts());
  const scroller = createElement("div", { className: "chat-scroll" }, [column]);
  const jump = createElement("button", {
    className: "chat-jump",
    hidden: true,
    attrs: { type: "button", "aria-label": "Jump to latest", title: "Jump to latest" }
  }, ["↓"]);
  const follower = createScrollFollower(scroller, (show) => (jump.hidden = !show), column);
  jump.addEventListener("click", () => follower.followNow());
  // Without a `recordings` port the composer has no attach button.
  const attachment = transport.recordings === undefined ? undefined : createRecordingAttachment(transport.recordings, () => shownTarget.projectId ?? latestStatus?.projectId);
  const composer = createComposer((text, recordingId) => {
    if (!actionsAllowed()) return Promise.resolve(false);
    const destination = controller;
    follower.followNow();
    return destination.send(text, recordingId);
  }, attachment, options.composer);
  // A "missing" read is a claim about the moment it was made: the Lab adds its
  // key just before it types the request, and a person may add one in FluxIQ
  // and come back. Turning to the composer is when the line matters, so the
  // keys are read again then, not only on the next poll (round 5: a build
  // began under "FluxIQ needs a model key" and then ran with one).
  const recheckReadiness = (): void => { if ((readiness === "missing" || modelReadinessLockReason(readiness) !== null) && readinessAsk !== null && readinessReading === null) askReadiness(); };
  composer.element.addEventListener("focusin", recheckReadiness);
  composer.element.addEventListener("input", recheckReadiness);
  const main = createElement("div", { className: "chat-main" }, [scroller, jump]);
  // Show me moves the transcript's own scroll, not the page's (`view/show-turn.ts`).
  const banner = options.pendingBanner === true ? createPendingBanner((turnId) => showTurn(scroller, thread.turnElement(turnId))) : undefined;
  // Each press goes through the owner of the moment, so a press for an older owner is refused (`lease-transport.ts`).
  const runs: ChatRunPort = {
    stop: (target) => owner.transport.runs.stop(target),
    takeOver: (target) => owner.transport.runs.takeOver(target),
    handBack: (target) => owner.transport.runs.handBack(target),
    // The lease keeps what the transport has, so this is there exactly when the client's is.
    ...(transport.runs.openInstructions === undefined ? {} : { openInstructions: (runId: string) => owner.transport.runs.openInstructions!(runId) })
  };
  const stop = createStopControl(runs, () => connected && actionsAllowed());
  // Take over and Hand back sit beside Stop, for runs only (`hold-control.ts`).
  const hold = createHoldControl(runs, () => connected && actionsAllowed());
  // The one status above the composer: state, time, cost and the one Stop (`work-header/`). Its button opens the thread holding the question.
  const header = createWorkHeaderView({
    controls: [hold.element, stop.element],
    onAction: () => { if (owner.current() && actionsAllowed() && answerIn !== null) open(answerIn); }
  });
  const dock = createElement("div", { className: "chat-dock" }, [header.element, composer.element]);
  const fallbackWords = options.fallback ?? { title: "Talk to FluxIQ in the FluxIQ window.", line: "This browser can't hold the conversation here. Open FluxIQ from the top of this panel." };
  const fallback = createElement("div", { className: "chat-fallback", hidden: true }, [
    createElement("p", { className: "chat-empty-title", text: fallbackWords.title }),
    createElement("p", { className: "chat-empty-line", text: fallbackWords.line })
  ]);
  const element = createElement("section", { className: "chat-panel", attrs: { "aria-label": "Chat with FluxIQ", tabindex: "-1" } }, [
    context.element,
    ...(threads === undefined ? [] : [threads.element]),
    ...(banner === undefined ? [] : [banner.element]),
    main,
    dock,
    fallback
  ]);

  // Open FluxIQ links inside turns, kept only while their turn is on screen.
  let turnOpeners: ChatOpenControl[] = [];
  const turnControls = createTurnControls({
    owner: () => owner,
    scope: () => actionScope,
    controller: () => controller,
    allowed: actionsAllowed,
    status: () => latestStatus,
    track: (opener) => turnOpeners.push(opener),
    openControl: options.openControl,
    asks: options.asks
  });
  let latestStatus: ChatHostStatus | undefined;
  let connected = false;
  let historyTaken = false;
  let hadTurns: boolean | undefined;
  let seen: ReadonlySet<string> | undefined;
  let active = false;
  let activationObserved = false;
  let replaced = false;
  let unsupported = false;
  let feedUnsupported = false;
  let questionKey = "";
  let answersKey = "";
  let timer: ReturnType<typeof setInterval> | undefined;
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let unhear: (() => void) | undefined;
  // The run the shell followed to this chat, until a thread showing it is on screen (`followRun`).
  let followed: ClientGatewayActivity | null = null;
  // The conversation id of each thread this chat has read, and each automation's name it has shown.
  const knownThreads = new Map<string, string>();
  const flowNames = new Map<string, string>();

  function actionsAllowed(): boolean { return owner.current() && (active || (!activationObserved && !replaced)); }
  function makeController(captured: ChatOwner): ConversationController {
    const changed = (): void => {
      if (captured === owner && captured.current()) {
        renderAll();
      }
    };
    return createConversationController(captured.transport.conversation, changed, undefined, {
      ...(options.history === undefined ? {} : { window: options.history.window }),
      withoutProject: () => threads?.withoutProject(),
      quiet: () => background
    });
  }
  /** The thread whose outcomes are read: the project and conversation now on screen, or none until the thread is known. */
  function answerQuery(): { projectId: string; conversationId: string } | undefined {
    const projectId = shownTarget.projectId ?? latestStatus?.projectId;
    const conversationId = controller.state().conversationId;
    return projectId === undefined || conversationId === undefined ? undefined : { projectId, conversationId };
  }
  function makeReader(captured: ChatOwner): AnswerReader {
    return createAnswerReader(captured.transport.results, answerQuery, () => {
      if (captured === owner && captured.current()) renderAll();
    });
  }
  function makeFeed(captured: ChatOwner) {
    return createActivityFeed({ activity: captured.transport.activity }, () => {
      if (captured === owner && captured.current()) {
        onFeedChange();
      }
    });
  }
  function refreshControls(renewBack = false): void {
    const scope = {};
    actionScope = scope;
    const captured = owner;
    const destination = controller;
    const eligible = () => captured === owner && captured.current() && actionScope === scope && actionsAllowed();
    if (renewBack) {
      const backLease = {};
      backScope = backLease;
      const oldBack = context.element.children[0]!;
      const back = createElement("button", { className: "chat-context-back", attrs: { type: "button", "aria-label": "Back to the latest chat", title: "Back to the latest chat" } });
      back.append(...Array.from(oldBack.childNodes));
      back.addEventListener("click", () => {
        if (captured !== owner || !captured.current() || backLease !== backScope || !actionsAllowed() || shownTarget.kind === "latest") return;
        const handoff = document.activeElement === back && navigationVisible(back) && document.hasFocus() && document.visibilityState === "visible";
        open({ kind: "latest" });
        if (handoff) handFocusOn(element, composer);
      });
      context.element.insertBefore(back, oldBack);
      oldBack.remove();
    }
    empty = createEmptyState((text) => {
      if (eligible()) {
        composer.fill(text);
      }
    }, {
      ...(keyOpener === undefined ? {} : { keyAction: keyOpener.element }),
      start: (start) => {
        if (!eligible()) {
          return;
        }
        if (start === "describe") {
          composer.focus();
        } else {
          options.onExtract?.();
        }
      }
    });
    readNotice = createReadNotice(() => {
      if (eligible()) {
        void destination.retry();
      }
    });
    thread = createThreadView(threadOptions());
    column.replaceChildren(...columnParts());
  }
  function startReads(): void {
    if (!active || timer !== undefined) return;
    if (!feedUnsupported && !background) {
      feed.start();
      void feed.read();
    }
    if (unsupported) return;
    void controller.refresh();
    void reader.read();
    void threads?.read();
    unhear = owner.transport.changes?.subscribe(scheduleThreadRefresh);
    const captured = owner;
    const destination = controller;
    const currentFeed = feed;
    const handle = timer = setInterval(() => {
      if (timer !== handle || captured !== owner || !captured.current() || !active) return;
      if (!background && document.visibilityState !== "visible") return;
      void threads?.read();
      if (background) return;
      if (!unsupported) {
        void destination.refresh();
        void reader.read();
      }
      if (!feedUnsupported && currentFeed.snapshot().reach === "failed") void currentFeed.read();
      // A key added after the chat read "missing" (in FluxIQ, or by the Lab
      // installing its key once the panel was already open) must lift the
      // line: R4a's start card said no key was set while the build ran with
      // one (`run-mv2nlh9l-52e476da`, moment 1). Asked again only while the
      // empty latest chat is on screen and still says the key is missing.
      // A key that was fine can lock while the chat is open (a sign-out elsewhere): the step must show without reopening, so that is read too, less often.
      if (readinessAsk !== null && (readiness === "missing" || modelReadinessLockReason(readiness) !== null || Date.now() - readinessAskedAtMs >= READY_RECHECK_MS)) askReadiness();
    }, readBeatMs(background, owner.transport.changes !== undefined));
  }
  function resetOwner(next: ChatOwner, initial: boolean): void {
    stopTimer();
    feed.stop();
    controller.setConnected(false);
    owner = next;
    replaced ||= !initial;
    controller = makeController(owner);
    reader = makeReader(owner);
    answersKey = "";
    feed = makeFeed(owner);
    // With a thread list the latest chat is the host's project, so a first message has somewhere to open a thread.
    shownTarget = threads !== undefined && latestStatus?.projectId !== undefined ? { kind: "latest", projectId: latestStatus.projectId } : { kind: "latest" };
    threads?.reset();
    answerIn = null;
    questionKey = "";
    followed = null;
    knownThreads.clear();
    flowNames.clear();
    clock = createTurnClock();
    historyTaken = false;
    seen = undefined;
    turnOpeners = [];
    readiness = "unknown";
    readinessAsk = null;
    readinessReading = null;
    composer.setOwner(draftOwners.capture(owner, draftProject(), latestStatus?.projectId));
    composer.setPlaceholder("Message FluxIQ");
    context.update(shownTarget);
    refreshControls(true);
    renderAll();
    if (!initial) for (const listener of [...targetListeners]) listener(shownTarget);
  }

  function open(next: ChatTarget, follow = true): void {
    if (next.projectId === undefined && shownTarget.projectId !== undefined && shownTarget.kind !== "thread") next = { ...next, projectId: shownTarget.projectId };
    if (sameTarget(next, shownTarget)) return;
    const threadChanges = !sameThread(next, shownTarget);
    shownTarget = next;
    if (next.kind === "automation" && next.name.trim() !== "") flowNames.set(next.flowId, next.name);
    composer.setOwner(draftOwners.capture(owner, draftProject(), latestStatus?.projectId));
    if (threadChanges) {
      // Another thread: its first read is history again, and nothing of the last one stays.
      clock = createTurnClock();
      historyTaken = false;
      refreshControls();
    }
    context.update(next);
    composer.setPlaceholder(next.kind === "automation" ? `Message FluxIQ about ${next.name.trim() || "this automation"}` : "Message FluxIQ");
    controller.setTarget(next);
    if (follow) follower.followNow();
    renderAll();
    for (const listener of [...targetListeners]) listener(next);
    threads?.targetChanged(next);
  }

  function draftProject(): string | undefined {
    return shownTarget.kind === "thread" ? undefined : shownTarget.projectId;
  }

  function onFeedChange(): void {
    if (feed.snapshot().reach === "unsupported") feedUnsupported = true;
    const decision = threadRefreshWanted(seen, feed.snapshot().state);
    seen = decision.seen;
    if (decision.refresh) scheduleThreadRefresh();
    renderAll();
  }

  function scheduleThreadRefresh(): void {
    if (debounce !== undefined || !active) return;
    const captured = owner;
    const destination = controller;
    const handle = debounce = setTimeout(() => {
      if (debounce !== handle || captured !== owner || !captured.current() || !active) return;
      debounce = undefined;
      void destination.refresh();
      void reader.read();
      void threads?.read();
    }, THREAD_REFRESH_DEBOUNCE_MS);
  }

  function renderAll(): void {
    const raw = feed.snapshot().state.current;
    const paced = feed.snapshot().state.display;
    const ended = paced?.activityId === raw?.activityId && (paced?.outcome === "done" || paced?.outcome === "failed");
    const projectId = shownTarget.projectId ?? latestStatus?.projectId;
    // Stop is offered from the send's "Starting…" on, before Core names the work (`stop-control.ts`, D9).
    const live = raw && !ended && (projectId === undefined || raw.subject.projectId === projectId) ? raw : null;
    stop.update(live, paced?.kind === "starting");
    hold.update(live);
    if (followed !== null && followRunNow()) return;
    let state = controller.state();
    if (state.fallbackReason === "unsupported") unsupported = true;
    if (unsupported) state = { ...state, mode: connected ? "fallback" : "offline", fallbackReason: "unsupported" };
    const activity = activityForTarget(feed.snapshot().state, shownTarget, state.conversationId);
    answerIn = activity.answerIn;
    const nextQuestion = answerIn === null ? "" : JSON.stringify([answerIn.subjectKind, answerIn.subjectId, answerIn.activityId]);
    if (nextQuestion !== questionKey) {
      questionKey = nextQuestion;
      refreshControls();
    }
    const fallbackShown = state.mode === "fallback";
    if (fallback.hidden === fallbackShown) fallback.hidden = !fallbackShown;
    if (main.hidden !== fallbackShown) main.hidden = fallbackShown;
    if (dock.hidden !== fallbackShown) dock.hidden = fallbackShown;
    readNotice.render(state);
    notice.update(state.notice);
    composer.setUnavailable(threads?.unavailable());
    composer.render(state);
    threads?.render(state.conversationId);
    earlier?.update(state.earlierTurns === true, state.earlierCount);
    if (shownTarget.projectId !== undefined) {
      element.setAttribute(CHAT_PROJECT_NAVIGATION.projectAttribute, state.projectId ?? shownTarget.projectId);
      element.setAttribute(CHAT_PROJECT_NAVIGATION.scopeStateAttribute, state.scopeState ?? "error");
    } else {
      element.removeAttribute(CHAT_PROJECT_NAVIGATION.projectAttribute);
      element.removeAttribute(CHAT_PROJECT_NAVIGATION.scopeStateAttribute);
    }

    // The first read's unstamped turns are history: they sort before every step message.
    const stamped = clock.stamp(state.turns, historyTaken ? Date.now() : Number.NEGATIVE_INFINITY);
    if (state.mode === "thread" || state.mode === "empty") historyTaken = true;
    // The unit of work of the moment: running, or waiting on the person, whose
    // newest action card says "Working on it", and whose cards Core has not
    // settled a wait for say "Waiting for you". Once the unit ends, a wait
    // Core never settled says nothing rather than claiming how it went.
    const display = activity.display;
    const working = display && (display.working || display.outcome === "waiting") ? display.activityId : null;
    // The thread on screen became known or changed: its outcomes are read now, not on the next poll.
    const asked = JSON.stringify(answerQuery() ?? null);
    if (asked !== answersKey) {
      answersKey = asked;
      if (active) void reader.read();
    }
    const inStream = thread.render(
      buildChatStream(stamped, activity.events, CHAT_STEP_MESSAGE_LIMIT, reader.outcomes()),
      (turn) => turnControls(turn, state),
      working
    );
    // The status above the composer. "Show the question" only when the question is in another thread: a pending question already in the thread on screen is answered where it stands.
    header.update({
      display,
      activity: live,
      sending: state.sending,
      questionElsewhere: answerIn !== null && !state.turns.some((turn) => turn.ask?.status === "pending"),
      ...spread(meterOfOutcomes(reader.outcomes(), owner.transport.results))
    });
    const anything = inStream || state.sending || display?.working === true || display?.outcome === "waiting";
    banner?.update(fallbackShown ? undefined : state.turns.filter((turn) => turn.ask?.status === "pending").at(-1)?.turnId);
    // The keys are read each time the connected, empty latest chat comes on
    // screen, and again on each poll while they read "missing" (`startReads`).
    if (!(connected && shownTarget.kind === "latest" && state.mode === "empty" && actionsAllowed())) readinessAsk = null;
    else if (readinessAsk === null) askReadiness();
    const emptyModel = emptyStateModel(state.mode, shownTarget, readiness, { extract: options.onExtract !== undefined, welcome: options.welcome });
    empty.update(emptyModel, anything);
    turnOpeners = turnOpeners.filter((opener) => opener.element.isConnected);
    // An empty chat's welcome is read from its top; a conversation follows its newest at the bottom.
    follower.rest(state.mode === "empty" && emptyModel !== null && !anything);
    follower.contentChanged();

    const hasTurns = state.turns.length > 0;
    if (hasTurns !== hadTurns) {
      hadTurns = hasTurns;
      onConversation(hasTurns);
    }
    if (state.conversationId !== undefined && (state.mode === "thread" || state.mode === "empty")) knownThreads.set(threadKey(shownTarget), state.conversationId);
    // Only an unsupported background is for good; a refused token can come back after pairing again.
    if (state.fallbackReason === "unsupported") stopTimer();
  }

  /**
   * Opens a thread that shows the followed run, once nothing holds it back;
   * true when it opened one (and so rendered already). A run that ended, a
   * recording, or a thread on screen that already shows it lets it go; the
   * person typing in the composer, or a thread not read yet, keeps it waiting.
   */
  function followRunNow(): boolean {
    const raw = feed.snapshot().state.current;
    const run = raw?.activityId === followed!.activityId ? raw : followed!;
    const recording = latestStatus?.recording === true;
    if (run.final === true || run.phase === "done" || run.phase === "failed" || recording || !actionsAllowed()) {
      followed = null;
      return false;
    }
    const box = composer.element.querySelectorAll("textarea")[0];
    if (box !== undefined && document.activeElement === box && box.value.trim() !== "") return false;
    const state = controller.state();
    if (state.mode === "loading" || (state.reading && state.conversationId === undefined && state.mode !== "offline")) return false;
    followed = null;
    const next = followedRunTarget({
      run,
      target: shownTarget,
      conversationId: state.conversationId,
      flowName: run.subject.flowId === undefined ? undefined : flowNames.get(run.subject.flowId),
      known: knownThreads
    });
    if (next === null) return false;
    const before = shownTarget;
    open(next);
    return shownTarget !== before;
  }

  function askReadiness(): void {
    const ask = {};
    readinessAsk = ask;
    readinessAskedAtMs = Date.now();
    const captured = owner;
    readinessReading = ask;
    void readModelReadiness(captured.transport.models).then((next) => {
      if (readinessReading === ask) readinessReading = null;
      if (ask !== readinessAsk || captured !== owner || !captured.current() || next === readiness) return;
      readiness = next;
      renderAll();
    });
  }

  function stopTimer(): void {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
    if (debounce !== undefined) clearTimeout(debounce);
    debounce = undefined;
    unhear?.();
    unhear = undefined;
  }

  refreshControls(true);
  context.update(shownTarget);
  if (!showContext) {
    context.element.remove();
  }
  renderAll();

  return {
    element,
    render(status) {
      latestStatus = status;
      const next = status.connected;
      const changed = next !== connected;
      connected = next;
      const observation = owners.observe(status);
      if (observation.changed) {
        resetOwner(owners.capture(), observation.initial);
      } else {
        composer.setOwner(draftOwners.capture(owner, draftProject(), latestStatus?.projectId));
      }
      threads?.render(controller.state().conversationId);
      for (const opener of turnOpeners) {
        opener.observe(status);
      }
      keyOpener?.observe(status);
      controller.setConnected(next && actionsAllowed() && !unsupported);
      if (changed) renderAll();
      if (observation.changed || changed) startReads();
    },
    setActive(next) {
      const first = !activationObserved;
      activationObserved = true;
      if (next === active && !first) return;
      active = next;
      stopTimer();
      if (!next) {
        feed.stop();
        controller.setConnected(false);
        refreshControls(true);
        renderAll();
        return;
      }
      refreshControls(true);
      controller.setConnected(connected && !unsupported);
      renderAll();
      startReads();
    },
    focusComposer() {
      composer.focus();
    },
    attachLatestRecording: () => attachment?.attachLatest() ?? Promise.resolve(false),
    open,
    updateAutomationName(automation) {
      if (shownTarget.kind !== "automation" || shownTarget.flowId !== automation.flowId) return;
      open({ kind: "automation", ...automation }, false);
    },
    target() {
      return shownTarget;
    },
    onTargetChange(listener) {
      targetListeners.add(listener);
      return () => targetListeners.delete(listener);
    },
    followRun(run) {
      if (run.subject.kind !== "run") return;
      followed = run;
      renderAll();
    },
    setBackground(on) {
      if (on === background) return;
      background = on;
      stopTimer();
      if (on) feed.stop();
      else follower.followNow();
      startReads();
    },
    showEarlier() {
      void controller.showEarlier();
    }
  };
}

/** `{ meter }` when there is a meter, so the header's update never holds an explicit `undefined`. */
function spread(meter: WorkMeter | undefined): { meter?: WorkMeter } {
  return meter === undefined ? {} : { meter };
}
