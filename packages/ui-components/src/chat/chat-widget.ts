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
// FluxIQ in the FluxIQ window."; the shell's Open FluxIQ is the way there.

import { createElement } from "../dom/index.ts";
import type { ClientGatewayActivity } from "fluxiq/ui";
import { createRecordingAttachment } from "./attachment/index.ts";
import { createComposer, createConversationController, createReadNotice, type ConversationState, type CoreTurn } from "./conversation/index.ts";
import { createActivityFeed, threadRefreshWanted } from "./feed/index.ts";
import { sameThread } from "./same-thread.ts";
import { createHoldControl, createStopControl } from "./controls/index.ts";
import { createChatOwnerContext, type ChatOwner } from "./owner-context.ts";
import type { ChatHostStatus, ChatOpenControl, ChatOpenControlFactory, ChatRunPort, ChatTransport } from "./ports/index.ts";
import { readModelReadiness, type ModelReadiness } from "./onboarding/index.ts";
import { activityForTarget, buildChatStream, createTurnClock, followedRunTarget, threadKey, type QuestionTarget } from "./stream/index.ts";
import type { ChatTarget } from "./target.ts";
import { CHAT_PROJECT_NAVIGATION, createProjectDraftOwner } from "./project-navigation/index.ts";
import {
  createContextLine,
  createEmptyState,
  createScrollFollower,
  createThreadView,
  emptyStateModel,
  liveLineModel,
  type TurnControls
} from "./view/index.ts";

const THREAD_POLL_MS = 4_000;
const THREAD_REFRESH_DEBOUNCE_MS = 300;

/** The mounted chat. */
export type ChatWidget = {
  readonly element: HTMLElement;
  /** Tells it what the host knows of its connection; a different `ownerKey` makes it forget the last owner's chat. */
  render(status: ChatHostStatus): void;
  /** Starts or stops reading the thread and the activity; starting reads both at once. */
  setActive(active: boolean): void;
  /** Puts the caret in the composer. */
  focusComposer(): void;
  /** Attaches the project's newest finished, described recording to the next message; answers whether there was one. */
  attachLatestRecording(): Promise<boolean>;
  /** Shows `target`'s thread; what the person sends from then on goes there. */
  open(target: ChatTarget): void;
  /** Updates only the current automation's name, preserving the reading position. */
  updateAutomationName(automation: { readonly flowId: string; readonly name: string }): void;
  /** The thread shown now. */
  target(): ChatTarget;
  /** Hears every change of target, including the person's own "Latest chat". Answers an unsubscribe. */
  onTargetChange(listener: (target: ChatTarget) => void): () => void;
  /**
   * Shows `run`'s steps live: when the thread on screen would not show them,
   * opens one that does (`stream/run-target.ts`), waiting while the person
   * types in the composer and never during a recording.
   */
  followRun(run: ClientGatewayActivity): void;
};

/** How a client mounts the chat. */
export type ChatWidgetOptions = {
  /** Hears whether the thread has turns, each time that changes. */
  onConversation?: (hasTurns: boolean) => void;
  /**
   * Whether the chat shows its own line naming the automation, with "Latest
   * chat" (default true). A panel that shows the open automation above the
   * chat itself passes false, so the name is not said twice.
   */
  contextLine?: boolean;
  /**
   * The empty latest chat's "Extract data from this page": the panel shows its extraction sheet.
   * Absent, the empty chat does not offer it.
   */
  onExtract?: () => void;
  /**
   * Makes an Open FluxIQ control, for a question that only FluxIQ can show; the host draws it, so the
   * chat does not reach into the host. Absent, the model-key line has no link and an ask's Open FluxIQ is empty.
   */
  openControl?: ChatOpenControlFactory;
  /** The owner key the chat starts under, so a first status with the same key is not a change of owner. */
  ownerKey?: string;
};

/** Creates the chat, talking to FluxIQ through `transport`. */
export function createChatWidget(transport: ChatTransport, options: ChatWidgetOptions = {}): ChatWidget {
  const onConversation = options.onConversation ?? (() => undefined);
  const showContext = options.contextLine !== false;
  let shownTarget: ChatTarget = { kind: "latest" };
  const targetListeners = new Set<(target: ChatTarget) => void>();
  const owners = createChatOwnerContext(transport, options.ownerKey);
  let owner = owners.capture();
  const draftOwners = createProjectDraftOwner();
  let controller = makeController(owner);
  let feed = makeFeed(owner);
  let clock = createTurnClock();
  let actionScope = {};
  let backScope = {};

  const context = createContextLine(() => undefined);
  // The thread holding the question the work waits on, while it is not the one on screen.
  let answerIn: QuestionTarget | null = null;
  let thread = createThreadView();
  // The model-key line's Open FluxIQ, moved into each empty state the chat builds.
  const keyOpener = options.openControl?.({ label: "Open FluxIQ", look: "small", canOpen: () => owner.current() && actionsAllowed() });
  let readiness: ModelReadiness = "unknown";
  let readinessAsk: object | null = null;
  // The read of the keys on its way, if any, so typing never queues one per key press.
  let readinessReading: object | null = null;
  let empty = createEmptyState(() => undefined);
  let readNotice = createReadNotice(() => undefined);
  const column = createElement("div", { className: "chat-column" }, [empty.element, thread.element, readNotice.element]);
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
  }, attachment);
  // A "missing" read is a claim about the moment it was made: the Lab adds its
  // key just before it types the request, and a person may add one in FluxIQ
  // and come back. Turning to the composer is when the line matters, so the
  // keys are read again then, not only on the next poll (round 5: a build
  // began under "FluxIQ needs a model key" and then ran with one).
  const recheckReadiness = (): void => { if (readiness === "missing" && readinessAsk !== null && readinessReading === null) askReadiness(); };
  composer.element.addEventListener("focusin", recheckReadiness);
  composer.element.addEventListener("input", recheckReadiness);
  const main = createElement("div", { className: "chat-main" }, [scroller, jump]);
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
  const runControls = createElement("div", { className: "chat-run-controls" }, [hold.element, stop.element]);
  const dock = createElement("div", { className: "chat-dock" }, [runControls, composer.element]);
  const fallback = createElement("div", { className: "chat-fallback", hidden: true }, [
    createElement("p", { className: "chat-empty-title", text: "Talk to FluxIQ in the FluxIQ window." }),
    createElement("p", { className: "chat-empty-line", text: "This browser can't hold the conversation here. Open FluxIQ from the top of this panel." })
  ]);
  const element = createElement("section", { className: "chat-panel", attrs: { "aria-label": "Chat with FluxIQ", tabindex: "-1" } }, [
    context.element,
    main,
    dock,
    fallback
  ]);

  // Open FluxIQ links inside turns, kept only while their turn is on screen.
  let turnOpeners: ChatOpenControl[] = [];
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
  let timer: ReturnType<typeof setInterval> | undefined;
  let debounce: ReturnType<typeof setTimeout> | undefined;
  // The run the shell followed to this chat, until a thread showing it is on screen (`followRun`).
  let followed: ClientGatewayActivity | null = null;
  // The conversation id of each thread this chat has read, and each automation's name it has shown.
  const knownThreads = new Map<string, string>();
  const flowNames = new Map<string, string>();

  function actionsAllowed(): boolean { return owner.current() && (active || (!activationObserved && !replaced)); }
  function makeController(captured: ChatOwner) {
    return createConversationController(captured.transport.conversation, () => {
      if (captured === owner && captured.current()) {
        renderAll();
      }
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
        if (!handoff || !document.hasFocus() || document.visibilityState !== "visible" || !navigationVisible(element)) return;
        const box = composer.element.querySelector<HTMLTextAreaElement>("#conversationInput");
        if (box && !box.disabled && navigationVisible(box)) {
          composer.focus();
        } else {
          element.focus({ preventScroll: true });
        }
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
    thread = createThreadView(() => {
      if (eligible() && answerIn !== null) {
        open(answerIn);
      }
    });
    column.replaceChildren(empty.element, thread.element, readNotice.element);
  }
  function startReads(): void {
    if (!active || timer !== undefined) return;
    if (!feedUnsupported) {
      feed.start();
      void feed.read();
    }
    if (unsupported) return;
    void controller.refresh();
    const captured = owner;
    const destination = controller;
    const currentFeed = feed;
    const handle = timer = setInterval(() => {
      if (timer !== handle || captured !== owner || !captured.current() || document.visibilityState !== "visible" || !active) return;
      if (!unsupported) void destination.refresh();
      if (!feedUnsupported && currentFeed.snapshot().reach === "failed") void currentFeed.read();
      // A key added after the chat read "missing" (in FluxIQ, or by the Lab
      // installing its key once the panel was already open) must lift the
      // line: R4a's start card said no key was set while the build ran with
      // one (`run-mv2nlh9l-52e476da`, moment 1). Asked again only while the
      // empty latest chat is on screen and still says the key is missing.
      if (readiness === "missing" && readinessAsk !== null) askReadiness();
    }, THREAD_POLL_MS);
  }
  function resetOwner(next: ChatOwner, initial: boolean): void {
    stopTimer();
    if (debounce !== undefined) {
      clearTimeout(debounce);
    }
    debounce = undefined;
    feed.stop();
    controller.setConnected(false);
    owner = next;
    replaced ||= !initial;
    controller = makeController(owner);
    feed = makeFeed(owner);
    shownTarget = { kind: "latest" };
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
    composer.setOwner(draftOwners.capture(owner, shownTarget.projectId, latestStatus?.projectId));
    composer.setPlaceholder("Message FluxIQ");
    context.update(shownTarget);
    refreshControls(true);
    renderAll();
    if (!initial) for (const listener of [...targetListeners]) listener(shownTarget);
  }

  function open(next: ChatTarget, follow = true): void {
    if (next.projectId === undefined && shownTarget.projectId !== undefined) next = { ...next, projectId: shownTarget.projectId };
    if (sameTarget(next, shownTarget)) return;
    const threadChanges = !sameThread(next, shownTarget);
    shownTarget = next;
    if (next.kind === "automation" && next.name.trim() !== "") flowNames.set(next.flowId, next.name);
    composer.setOwner(draftOwners.capture(owner, next.projectId, latestStatus?.projectId));
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
    composer.render(state);
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
    const anything = thread.render(
      buildChatStream(stamped, activity.events),
      liveLineModel(activity.display, state.sending, answerIn !== null),
      (turn) => turnControls(turn, state),
      working
    );
    // The keys are read each time the connected, empty latest chat comes on
    // screen, and again on each poll while they read "missing" (`startReads`).
    if (!(connected && shownTarget.kind === "latest" && state.mode === "empty" && actionsAllowed())) readinessAsk = null;
    else if (readinessAsk === null) askReadiness();
    const emptyModel = emptyStateModel(state.mode, shownTarget, readiness, { extract: options.onExtract !== undefined });
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

  function turnControls(turn: CoreTurn, state: ConversationState): TurnControls {
    const captured = owner;
    const scope = actionScope;
    const destination = controller;
    const askSignature = JSON.stringify(turn.ask);
    const eligible = () => captured === owner && captured.current() && scope === actionScope && actionsAllowed()
      && destination.state().conversationId === state.conversationId
      && destination.state().turns.some((current) => current.turnId === turn.turnId && current.text === turn.text && JSON.stringify(current.ask) === askSignature);
    const askId = turn.ask?.askId;
    const answering = askId !== undefined && state.answering.has(askId);
    const error = askId === undefined ? undefined : state.answerErrors.get(askId);
    return {
      state: `${answering}|${error ?? ""}`,
      ask: {
        answering,
        error,
        answer: (kind, value) => {
          if (eligible() && askId !== undefined) void destination.answer(askId, kind, value);
        },
        openFluxIQ: () => {
          if (!eligible() || options.openControl === undefined) {
            return createElement("span");
          }
          const made: ChatOpenControl = options.openControl({ label: "Open FluxIQ", look: "link", canOpen: () => eligible() && made.element.isConnected });
          if (latestStatus !== undefined) {
            made.observe(latestStatus);
          }
          turnOpeners.push(made);
          return made.element;
        }
      }
    };
  }

  function askReadiness(): void {
    const ask = {};
    readinessAsk = ask;
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
        composer.setOwner(draftOwners.capture(owner, shownTarget.projectId, latestStatus?.projectId));
      }
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
      if (debounce !== undefined) clearTimeout(debounce);
      debounce = undefined;
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
    }
  };
}

/** True when `a` and `b` are the same target: the same thread, under the same name, about the same work. */
function sameTarget(a: ChatTarget, b: ChatTarget): boolean {
  if (!sameThread(a, b)) return false;
  if (a.kind === "automation" && b.kind === "automation") return a.name === b.name;
  if (a.kind === "question" && b.kind === "question") return a.activityId === b.activityId && a.title === b.title;
  return true;
}

function navigationVisible(element: HTMLElement): boolean {
  return element.isConnected && !element.closest("[hidden], [inert]") && element.getClientRects().length > 0;
}
