// The work header, mounted once above the composer and kept for the chat's
// whole life: `Working · 1m 12s · $0.34 of $5.00 · [Stop]`, with what FluxIQ
// is doing now in one short line beneath (`work-header-model.ts`). It replaces
// the separate Stop row and the live line.
//
// Stop and Take over are the chat's own controls (`controls/`), handed in and
// mounted here once, so Stop is one element that is never rebuilt, whatever
// the state: a press while work is starting is held by the control itself, and
// it keeps its `chat-stop` class, its text and its accessible name. The header
// shows itself while the model has words or while any of those controls is
// offered, so a Stop is never hidden behind a header with nothing to say.
//
// The elapsed time ticks once a second while the header shows, in tabular
// numerals so its width holds. State changes are announced politely (the state
// words and the line beneath); the time and the cost are not in a live region,
// so nothing is read out every second. The element is updated in place and
// hidden between units of work; text goes in through `textContent` only.

import type { ActivityDisplay, ClientGatewayActivity } from "fluxiq/ui";
import { createElement } from "../../dom/index.ts";
import { createElapsedClock } from "./elapsed-clock.ts";
import { formatElapsed } from "./format-elapsed.ts";
import { workHeaderModel, type WorkHeaderInput, type WorkHeaderModel } from "./work-header-model.ts";

/** What the host passes on each render: the model's inputs and the raw live activity the clock reads. */
export type WorkHeaderUpdate = Omit<WorkHeaderInput, "display"> & {
  display: ActivityDisplay | null | undefined;
  /** The raw live activity (`ChatActivityState.current`), whose `at` starts the clock. */
  activity?: ClientGatewayActivity | null;
};

/** The mounted header. */
export type WorkHeaderView = {
  readonly element: HTMLElement;
  update(next: WorkHeaderUpdate): void;
  /** Stops the clock's timer; the header is not used afterwards. */
  destroy(): void;
};

/** Where the view gets its collaborators. */
export type WorkHeaderOptions = {
  /** Stop and Take over, mounted inside the header in this order. */
  controls: readonly HTMLElement[];
  /** The one button, "Show the question". */
  onAction?: () => void;
  /** The time in ms; the real clock by default. */
  now?: () => number;
};

const TICK_MS = 1000;

/** Creates the header, hidden. */
export function createWorkHeaderView(options: WorkHeaderOptions): WorkHeaderView {
  const now = options.now ?? (() => Date.now());
  const clock = createElapsedClock();
  const label = createElement("span", { className: "chat-work-label", attrs: { role: "status", "aria-live": "polite" } });
  const time = createElement("span", { className: "chat-work-time" });
  const cost = createElement("span", { className: "chat-work-cost" });
  const limit = createElement("span", { className: "chat-work-limit" });
  const status = createElement("div", { className: "chat-work-status" }, [label, time, cost, limit]);
  const controls = createElement("div", { className: "chat-work-controls" }, [...options.controls]);
  const line = createElement("p", { className: "chat-work-now", attrs: { "aria-live": "polite" } });
  const action = createElement("button", { className: "chat-work-action", hidden: true, attrs: { type: "button" } });
  action.addEventListener("click", () => options.onAction?.());
  const element = createElement("div", { className: "chat-work-header", hidden: true, attrs: { role: "group", "aria-label": "Work in progress" } }, [status, controls, line, action]);
  let last: WorkHeaderUpdate | null = null;
  let model: WorkHeaderModel | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;

  const stopTimer = () => {
    if (timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  };

  /** The elapsed time now; "" when the header has no unit of work. */
  function elapsed(): string {
    if (model === null || last === null) return "";
    const key = model.state === "sending" ? "sending" : last.activity?.activityId ?? last.display?.activityId ?? "work";
    const ms = clock.read(key, model.state === "sending" ? undefined : last.activity?.at, now(), last.meter?.startedAtMs);
    return ms === null ? "" : formatElapsed(ms);
  }

  function showTime(): void {
    const text = elapsed();
    setText(time, text);
    setHidden(time, text === "");
  }

  return {
    element,
    update(next) {
      last = next;
      model = workHeaderModel({ ...next, stopOffered: next.stopOffered ?? options.controls.some((control) => !control.hidden) });
      setHidden(element, model === null);
      if (model === null) {
        clock.read(null, undefined, now());
        stopTimer();
        return;
      }
      setAttr(element, "data-state", model.state);
      setText(label, model.label);
      setText(line, model.now);
      setHidden(line, model.now === "");
      setText(cost, model.cost);
      setHidden(cost, model.cost === "");
      setText(limit, model.limit);
      setHidden(limit, model.limit === "");
      setAttr(element, "data-near-limit", model.limit === "" ? "false" : "true");
      setText(action, model.action);
      setHidden(action, model.action === "");
      showTime();
      if (timer === undefined) timer = setInterval(showTime, TICK_MS);
    },
    destroy: stopTimer
  };
}

function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

function setHidden(node: HTMLElement, hidden: boolean): void {
  if (node.hidden !== hidden) node.hidden = hidden;
}

function setAttr(node: HTMLElement, name: string, value: string): void {
  if (node.getAttribute(name) !== value) node.setAttribute(name, value);
}
