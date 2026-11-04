// The tasks screen, mounted: a person's tasks, searched, and one opened to see its attempts and
// steps. It draws from `TasksPort` and holds nothing a client owns: everything is re-read when
// the screen becomes active, and the open task is kept only behind `TasksMemory`, so a panel
// that closed reopens on the same task. The latest answer is the answer turn's own view; Add
// budget and Run again are its buttons, through the same `ChatResultsPort`.
//
// A failed read is a quiet line with Try again and never takes off what was on screen. There
// is no failed ending anywhere here: the one that is not a result is a spent budget.

import { createAnswerView, type AnswerView } from "../../chat/answer/index.ts";
import type { ChatResultsPort, ChatTaskOutcome } from "../../chat/ports/index.ts";
import { createElement } from "../../dom/index.ts";
import { ownWaitingWords, taskActions, waitingReason } from "./model/index.ts";
import type { TaskSummary, TasksMemory, TasksPort } from "./port.ts";
import { detailsView, focusedKey, focusKey, listView, type DetailsHost, type DetailsState, type ListHost, type ListState, type StepsState } from "./view/index.ts";

export type TasksScreenOptions = {
  port: TasksPort;
  /** Add budget, Run again and the rows export. Absent: those are not drawn. */
  results?: ChatResultsPort;
  memory?: TasksMemory;
  /** The project whose tasks show; none yet means nothing to read. */
  projectId: () => string | undefined;
  /** Opens a task's chat. Absent: no Open in chat. */
  onOpenInChat?: (task: TaskSummary) => void;
  /** A task that was open before the panel closed is open again: the host may bring this screen forward. */
  onRestored?: () => void;
  now?: () => number;
  pageSize?: number;
  debounceMs?: number;
  timers?: { set(run: () => void, ms: number): unknown; clear(handle: unknown): void };
};

export type TasksScreen = {
  readonly element: HTMLElement;
  /** Becoming active reads everything again; the open task stays open. */
  setActive(active: boolean): void;
  /** Reopens the task that was open when the panel closed. Does nothing twice, or before there is a project. */
  restore(): void;
  /** Searches the tasks (after a pause). Empty clears it. */
  search(text: string): void;
  /** Called with how many tasks match the search, or null when there is no search or no answer. */
  onMatches(listener: (count: number | null) => void): void;
  /** Called when a task opens or closes, so the host can show the rest of its screen only beside the list. */
  onOpenChange(listener: (open: boolean) => void): void;
  /** Leaves an open task for the list. False when the list was already showing. */
  back(): boolean;
  isOpen(): boolean;
};

const EMPTY: ListState = { status: "idle", tasks: [], nextCursor: null, text: "", loadingMore: false };

/** Builds the tasks screen. */
export function createTasksScreen(options: TasksScreenOptions): TasksScreen {
  const { port, results, memory } = options;
  const now = options.now ?? Date.now;
  const timers = options.timers ?? { set: (run, ms) => setTimeout(run, ms), clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>) };
  const body = createElement("div", { className: "tasks-body" });
  const element = createElement("section", { className: "tasks-screen", attrs: { "aria-label": "Tasks" } }, [body]);
  const listeners: Array<(count: number | null) => void> = [];
  const openListeners: Array<(open: boolean) => void> = [];
  let wasOpen = false;
  const answers = new Map<string, AnswerView>();
  let list: ListState = EMPTY;
  let details: DetailsState | undefined;
  let active = false;
  let restored = false;
  let listToken = 0;
  let detailsToken = 0;
  let searchTimer: unknown;
  let wantedText = "";
  let pendingFocus: string | undefined;

  const reportsSpend = (): boolean => results?.reportsSpend !== false;

  function draw(): void {
    const keep = pendingFocus ?? focusedKey(element);
    pendingFocus = undefined;
    body.replaceChildren(...(details === undefined ? listView(list, listHost) : detailsView(details, detailsHost())));
    element.setAttribute("data-mode", details === undefined ? "list" : "details");
    if ((details !== undefined) !== wasOpen) {
      wasOpen = details !== undefined;
      for (const listener of openListeners) listener(wasOpen);
    }
    if (keep !== null) focusKey(element, keep);
  }

  function notifyMatches(): void {
    const count = list.text === "" || list.status !== "ready" || (list.error !== undefined && list.tasks.length === 0) ? null : list.tasks.length;
    for (const listener of listeners) listener(count);
  }

  function remember(): void {
    if (memory === undefined) return;
    const projectId = options.projectId();
    const open = details !== undefined && projectId !== undefined ? { projectId, taskId: details.taskId } : undefined;
    void memory.write(open).catch(/* best-effort: the memory is only a convenience */ () => undefined);
  }

  async function loadList(more = false): Promise<void> {
    const projectId = options.projectId();
    if (projectId === undefined) {
      list = { ...EMPTY, status: "ready", text: list.text };
      draw();
      return;
    }
    const token = ++listToken;
    if (more) list = { ...list, loadingMore: true };
    else if (list.tasks.length === 0) list = { ...list, status: "loading" };
    draw();
    const cursor = more ? list.nextCursor : null;
    const reply = await port.list({ projectId, limit: options.pageSize ?? 20, ...(list.text === "" ? {} : { text: list.text }), ...(cursor === null ? {} : { cursor }) });
    if (token !== listToken) return;
    if (reply.ok) {
      const kept = more ? list.tasks : [];
      const ids = new Set(kept.map((task) => task.taskId));
      const next: ListState = { status: "ready", tasks: [...kept, ...reply.value.tasks.filter((task) => !ids.has(task.taskId))], nextCursor: reply.value.nextCursor, text: list.text, loadingMore: false };
      if (list.note !== undefined) next.note = list.note;
      list = next;
    } else {
      list = { ...list, status: "ready", loadingMore: false, error: reply.sentence };
    }
    notifyMatches();
    draw();
  }

  const listHost: ListHost = {
    open: (taskId) => openTask(taskId),
    retry: () => void loadList(),
    more: () => void loadList(true),
    get nowMs() { return now(); },
    get reportsSpend() { return reportsSpend(); }
  };

  function updateDetails(change: Partial<DetailsState>): void {
    if (details !== undefined) details = { ...details, ...change };
  }

  function setSteps(attemptId: string, state: StepsState): void {
    if (details === undefined) return;
    updateDetails({ steps: new Map(details.steps).set(attemptId, state) });
  }

  async function loadSteps(attemptId: string, open: boolean): Promise<void> {
    const projectId = options.projectId();
    const taskId = details?.taskId;
    if (port.readSteps === undefined || projectId === undefined || details === undefined) return;
    const before = details.steps.get(attemptId);
    setSteps(attemptId, { status: "loading", steps: before?.steps ?? [], ...(before?.provenance === undefined ? {} : { provenance: before.provenance }), open: before?.open ?? open, quietOpen: before?.quietOpen ?? false });
    draw();
    const [steps, provenance] = await Promise.all([port.readSteps({ projectId, attemptId }), port.readProvenance?.({ projectId, attemptId }) ?? Promise.resolve(undefined)]);
    if (details?.taskId !== taskId) return;
    const current = details.steps.get(attemptId);
    const base = { open: current?.open ?? open, quietOpen: current?.quietOpen ?? false };
    if (!steps.ok) setSteps(attemptId, { ...base, status: "failed", steps: before?.steps ?? [], error: steps.sentence });
    else setSteps(attemptId, { ...base, status: "ready", steps: steps.value.steps, ...(provenance?.ok === true ? { provenance: provenance.value } : {}) });
    draw();
  }

  async function loadDetails(): Promise<void> {
    const projectId = options.projectId();
    const taskId = details?.taskId;
    if (projectId === undefined || taskId === undefined) return;
    const token = ++detailsToken;
    const reply = await port.read({ projectId, taskId });
    if (token !== detailsToken || details?.taskId !== taskId) return;
    if (!reply.ok) {
      const change: Partial<DetailsState> = { status: "failed", error: reply.sentence };
      updateDetails(change);
      draw();
      return;
    }
    const { error: _error, ...rest } = details;
    details = { ...rest, task: reply.value.task, attempts: reply.value.attempts, status: "ready" };
    list = { ...list, tasks: list.tasks.map((task) => (task.taskId === taskId ? reply.value.task : task)) };
    draw();
    const latest = reply.value.attempts[0]?.attempt.attemptId ?? reply.value.task.latest.attempt.attemptId;
    const known = new Set([latest, ...details.steps.keys()]);
    for (const attemptId of known) void loadSteps(attemptId, false);
  }

  function openTask(taskId: string): void {
    const fromList = list.tasks.find((task) => task.taskId === taskId);
    details = { taskId, attempts: [], status: "loading", steps: new Map(), carrying: false, ...(fromList === undefined ? {} : { task: fromList }) };
    remember();
    pendingFocus = "title";
    draw();
    void loadDetails();
  }

  function leave(): void {
    const taskId = details?.taskId;
    details = undefined;
    detailsToken++;
    remember();
    pendingFocus = taskId === undefined ? undefined : `row:${taskId}`;
    draw();
    void loadList();
  }

  function answerFor(latest: ChatTaskOutcome): HTMLElement | undefined {
    const reason = waitingReason(latest.attempt);
    if (reason !== undefined && ownWaitingWords(reason) !== undefined) return undefined;
    const attemptId = latest.attempt.attemptId;
    let view = answers.get(attemptId);
    if (view === undefined) {
      view = createAnswerView({
        ...(results === undefined ? {} : { results }),
        now,
        onWhatIDid: (id) => showSteps(id),
        onChanged: () => {
          void loadDetails();
          void loadList();
        }
      });
      answers.set(attemptId, view);
    }
    return view.update(latest) ? view.element : undefined;
  }

  function answerOfShown(): HTMLElement | undefined {
    const latest = details?.attempts[0] ?? details?.task?.latest;
    return latest === undefined ? undefined : answerFor(latest);
  }

  function showSteps(attemptId: string): void {
    const existing = details?.steps.get(attemptId);
    if (existing === undefined) void loadSteps(attemptId, true);
    else setSteps(attemptId, { ...existing, open: true });
    pendingFocus = `steps:${attemptId}`;
    draw();
  }

  function flipSteps(attemptId: string, change: (state: StepsState) => StepsState): void {
    const existing = details?.steps.get(attemptId);
    if (existing !== undefined) setSteps(attemptId, change(existing));
    draw();
  }

  async function rename(): Promise<void> {
    const projectId = options.projectId();
    const task = details?.task;
    const renaming = details?.renaming;
    if (projectId === undefined || task === undefined || renaming === undefined || port.rename === undefined) return;
    const title = renaming.draft.trim();
    if (title === "") {
      updateDetails({ renaming: { ...renaming, error: "Type a name first." } });
      pendingFocus = "rename-input";
      draw();
      return;
    }
    if (title === task.title) return cancelRename();
    updateDetails({ renaming: { ...renaming, busy: true } });
    draw();
    const reply = await port.rename({ projectId, taskId: task.taskId, title });
    if (details?.taskId !== task.taskId) return;
    if (!reply.ok) {
      updateDetails({ renaming: { draft: renaming.draft, busy: false, error: reply.sentence } });
      pendingFocus = "rename-input";
      draw();
      return;
    }
    const { renaming: _gone, ...rest } = details;
    details = { ...rest, task: { ...task, title }, note: { text: "Renamed.", tone: "info" } };
    pendingFocus = "rename";
    draw();
    void loadDetails();
    void loadList();
  }

  function cancelRename(): void {
    if (details === undefined) return;
    const { renaming: _gone, ...rest } = details;
    details = rest;
    pendingFocus = "rename";
    draw();
  }

  async function remove(): Promise<void> {
    const projectId = options.projectId();
    const task = details?.task;
    if (projectId === undefined || task === undefined || port.remove === undefined) return;
    updateDetails({ deleting: { busy: true } });
    draw();
    const reply = await port.remove({ projectId, taskId: task.taskId });
    if (details?.taskId !== task.taskId) return;
    if (!reply.ok) {
      updateDetails({ deleting: { busy: false, error: reply.sentence } });
      pendingFocus = "delete-cancel";
      draw();
      return;
    }
    details = undefined;
    detailsToken++;
    remember();
    list = { ...list, tasks: list.tasks.filter((candidate) => candidate.taskId !== task.taskId), note: `Deleted “${task.title}”.` };
    pendingFocus = "list-note";
    draw();
    void loadList();
  }

  async function carryOn(): Promise<void> {
    const projectId = options.projectId();
    const latest = details?.attempts[0] ?? details?.task?.latest;
    if (projectId === undefined || latest === undefined || port.carryOn === undefined || details?.carrying === true) return;
    const taskId = details?.taskId;
    updateDetails({ carrying: true });
    draw();
    const reply = await port.carryOn({ projectId, attemptId: latest.attempt.attemptId });
    if (details?.taskId !== taskId) return;
    if (!reply.ok) updateDetails({ carrying: false, note: { text: reply.sentence, tone: "error" } });
    else updateDetails({ carrying: false, note: { text: "Carrying on from where it stopped.", tone: "info" } });
    draw();
    void loadDetails();
    void loadList();
  }

  function detailsHost(): DetailsHost {
    return {
      nowMs: now(),
      reportsSpend: reportsSpend(),
      canShowSteps: port.readSteps !== undefined,
      steps: details?.steps ?? new Map(),
      toggleSteps: (attemptId) => {
        const existing = details?.steps.get(attemptId);
        if (existing === undefined) void loadSteps(attemptId, true);
        else flipSteps(attemptId, (state) => ({ ...state, open: !state.open }));
        if (existing?.status === "failed" && !existing.open) void loadSteps(attemptId, true);
      },
      retrySteps: (attemptId) => void loadSteps(attemptId, true),
      toggleQuiet: (attemptId) => flipSteps(attemptId, (state) => ({ ...state, quietOpen: !state.quietOpen })),
      back: leave,
      retry: () => void loadDetails(),
      actions: (task, latest) => taskActions(task, latest, port, options.onOpenInChat !== undefined),
      answer: answerOfShown(),
      title: {
        setDraft: (text) => {
          const renaming = details?.renaming;
          if (renaming !== undefined) updateDetails({ renaming: { ...renaming, draft: text } });
        },
        save: () => void rename(),
        cancel: cancelRename
      },
      confirm: {
        confirm: () => void remove(),
        cancel: () => {
          if (details === undefined) return;
          const { deleting: _gone, ...rest } = details;
          details = rest;
          pendingFocus = "delete";
          draw();
        }
      },
      startRename: () => {
        const task = details?.task;
        if (task === undefined) return;
        updateDetails({ renaming: { draft: task.title, busy: false } });
        pendingFocus = "rename-input";
        draw();
      },
      askDelete: () => {
        updateDetails({ deleting: { busy: false } });
        pendingFocus = "delete-cancel";
        draw();
      },
      carryOn: () => void carryOn(),
      openInChat: () => {
        const task = details?.task;
        if (task !== undefined) options.onOpenInChat?.(task);
      }
    };
  }

  element.addEventListener("keydown", (event) => {
    if ((event as KeyboardEvent).key !== "Escape" || details === undefined) return;
    event.preventDefault?.();
    if (details.renaming !== undefined && !details.renaming.busy) cancelRename();
    else if (details.deleting !== undefined && !details.deleting.busy) detailsHost().confirm.cancel();
    else leave();
  });

  function runSearch(): void {
    searchTimer = undefined;
    if (wantedText.trim() === list.text) return;
    const { note: _note, ...rest } = list;
    list = { ...rest, text: wantedText.trim() };
    void loadList();
  }

  draw();

  return {
    element,
    setActive(next) {
      if (next === active) return;
      active = next;
      if (!next) return;
      void loadList();
      if (details !== undefined) void loadDetails();
    },
    restore() {
      const projectId = options.projectId();
      if (restored || projectId === undefined) return;
      restored = true;
      if (memory === undefined) return;
      void memory.read().then((open) => {
        if (open === undefined || open.projectId !== projectId || details !== undefined) return;
        openTask(open.taskId);
        options.onRestored?.();
      }, /* best-effort: the memory is only a convenience */ () => undefined);
    },
    search(text) {
      wantedText = text;
      if (searchTimer !== undefined) timers.clear(searchTimer);
      if (text.trim() === "") runSearch();
      else searchTimer = timers.set(runSearch, options.debounceMs ?? 250);
    },
    onMatches: (listener) => void listeners.push(listener),
    onOpenChange: (listener) => void openListeners.push(listener),
    back() {
      if (details === undefined) return false;
      leave();
      return true;
    },
    isOpen: () => details !== undefined
  };
}

