// One humanness control: a level from Fastest (0) to Most human-like (100), in steps
// of 5, for one task, Flow or FluxNode. It holds no port: the host hands it the level
// it read and a `commit` that saves one, so the answer turn, a task screen or the
// extension's settings can each mount it over their own request.
//
//   Humanness for this task                                   40
//   [-----------o-----------------------------------------]
//   Fastest                                      Most human-like
//   Higher is slower and more person-like ... robot checks always pause for you.
//   Uses your starting value (40). Move the slider to give this its own level.
//   [Use starting value]                                  Saved.
//
// Two states. **Own level**: the task has its own, and "Use starting value" clears it.
// **Inherited**: it has none and uses the person's starting value, which the slider
// shows; moving the slider gives it its own.
//
// A request is never sent per pixel. Dragging shows the level as it moves and sends it
// once, on release (`change`). The arrow keys (and Page Up/Down, Home, End) are the
// control's own, so every browser steps by 5, and the level goes once the keys have
// rested for `settleMs`, or at once when focus leaves. One request is in flight at a
// time; a level chosen meanwhile waits and only the latest goes. A level already saved
// is never sent again. A refusal says the host's sentence (the person's words) and goes
// back to what was saved.

import { createElement } from "../../../dom/index.ts";
import type { ChatResult } from "../../ports/index.ts";
import { humannessWords } from "./level-words.ts";

/** A level as saved: the task's own when it has one, and the starting value it uses otherwise. */
export type HumannessLevel = { own?: number; starting: number };

/** Saves the task's own level, or clears it with `null`. Answers the own level as saved, absent once cleared. */
export type HumannessCommit = (humanness: number | null) => Promise<ChatResult<{ humanness?: number }>>;

/** What a host supplies. */
export type HumannessControlOptions = {
  /** The level as read. */
  level: HumannessLevel;
  commit: HumannessCommit;
  /** The slider's visible name. Default "Humanness". */
  label?: string;
  /** How long the keys must rest before their level is sent, in ms. Default 500. */
  settleMs?: number;
  /** Hears each level once it is saved, or once a refusal put it back. */
  onLevel?: (level: HumannessLevel) => void;
};

/** The mounted control. */
export type HumannessControl = {
  readonly element: HTMLElement;
  /** Shows a level read again. Ignored while a change of the person's is waiting or on its way, which it would undo. */
  show(level: HumannessLevel): void;
  /** The level as last saved or read. */
  level(): HumannessLevel;
  /** Sends a level the keys left waiting, and stops waiting. */
  dispose(): void;
};

type Status = { kind: "idle" | "pending" | "saved" } | { kind: "refused"; sentence: string };

const STEP = 5;
const PAGE = 10;
const FAILED = "Something went wrong. Try again.";
const EXPLAIN = "Higher is slower and more person-like (timing, click spots, the odd harmless misclick) for sites that limit robots; robot checks always pause for you.";

let made = 0;

/** A whole level from 0 to 100; anything else reads as 0. */
function whole(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function tidy(level: HumannessLevel): HumannessLevel {
  return level.own === undefined ? { starting: whole(level.starting) } : { own: whole(level.own), starting: whole(level.starting) };
}

/** The level a key moves to from `value`, on the steps of 5 even from a level between them. */
function keyed(key: string, value: number): number | undefined {
  if (key === "ArrowRight" || key === "ArrowUp") return Math.min(100, Math.floor(value / STEP) * STEP + STEP);
  if (key === "ArrowLeft" || key === "ArrowDown") return Math.max(0, Math.ceil(value / STEP) * STEP - STEP);
  if (key === "PageUp") return Math.min(100, Math.floor(value / STEP) * STEP + PAGE);
  if (key === "PageDown") return Math.max(0, Math.ceil(value / STEP) * STEP - PAGE);
  if (key === "Home") return 0;
  if (key === "End") return 100;
  return undefined;
}

async function asked(commit: HumannessCommit, humanness: number | null): Promise<ChatResult<{ humanness?: number }>> {
  try {
    return await commit(humanness);
  } catch {
    return { ok: false, sentence: FAILED };
  }
}

/** Creates the control over `options.commit`. */
export function createHumannessControl(options: HumannessControlOptions): HumannessControl {
  const settleMs = options.settleMs ?? 500;
  const id = `fluxiq-humanness-${++made}`;
  let saved = tidy(options.level);
  // What the slider shows: a level, and whether it is the task's own.
  let draft = { value: saved.own ?? saved.starting, own: saved.own !== undefined };
  let status: Status = { kind: "idle" };
  let inFlight = false;
  // The level chosen while another was on its way: `null` clears.
  let queued: { humanness: number | null } | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const label = createElement("span", { id: `${id}-label`, className: "humanness-label", text: options.label ?? "Humanness" });
  const value = createElement("span", { className: "humanness-value", attrs: { "aria-hidden": "true" } });
  const range = createElement("input", {
    className: "humanness-range",
    attrs: { type: "range", min: "0", max: "100", step: String(STEP), "aria-labelledby": `${id}-label`, "aria-describedby": `${id}-explain ${id}-inherited` }
  });
  const ends = createElement("div", { className: "humanness-ends", attrs: { "aria-hidden": "true" } }, [createElement("span", { text: "Fastest" }), createElement("span", { text: "Most human-like" })]);
  const explain = createElement("p", { id: `${id}-explain`, className: "humanness-explain", text: EXPLAIN });
  const inherited = createElement("p", { id: `${id}-inherited`, className: "humanness-inherited" });
  const clear = createElement("button", { className: "humanness-clear", text: "Use starting value", attrs: { type: "button" } });
  const said = createElement("p", { className: "humanness-status", attrs: { role: "status", "aria-live": "polite" } });
  const head = createElement("div", { className: "humanness-head" }, [label, value]);
  const element = createElement("div", { className: "humanness", attrs: { role: "group", "aria-labelledby": `${id}-label` } }, [head, range, ends, explain, inherited, clear, said]);

  function render(): void {
    const shown = String(draft.value);
    element.setAttribute("data-state", draft.own ? "own" : "inherited");
    element.setAttribute("data-status", status.kind);
    value.textContent = shown;
    if (range.value !== shown) range.value = shown;
    range.setAttribute("aria-valuetext", `${shown}, ${humannessWords(draft.value)}${draft.own ? "" : ", your starting value"}`);
    inherited.hidden = draft.own;
    inherited.textContent = draft.own ? "" : `Uses your starting value (${saved.starting}). Move the slider to give this its own level.`;
    clear.hidden = !draft.own;
    said.textContent = status.kind === "pending" ? "Saving…" : status.kind === "saved" ? "Saved." : status.kind === "refused" ? `Not saved. ${status.sentence}` : "";
    said.setAttribute("role", status.kind === "refused" ? "alert" : "status");
    if (status.kind === "idle") said.removeAttribute("data-tone");
    else said.setAttribute("data-tone", status.kind === "refused" ? "error" : status.kind === "saved" ? "ok" : "pending");
  }

  /** Whether `humanness` is what is saved already. */
  function isSaved(humanness: number | null): boolean {
    return humanness === null ? saved.own === undefined : saved.own === humanness;
  }

  function settled(): boolean {
    return !inFlight && queued === undefined && timer === undefined;
  }

  function showSaved(): void {
    draft = { value: saved.own ?? saved.starting, own: saved.own !== undefined };
  }

  async function send(humanness: number | null): Promise<void> {
    if (inFlight) {
      queued = { humanness };
      return;
    }
    if (isSaved(humanness)) {
      if (settled()) showSaved();
      render();
      return;
    }
    inFlight = true;
    status = { kind: "pending" };
    render();
    const answer = await asked(options.commit, humanness);
    inFlight = false;
    if (answer.ok) {
      const own = humanness === null ? undefined : whole(typeof answer.value.humanness === "number" ? answer.value.humanness : humanness);
      saved = own === undefined ? { starting: saved.starting } : { own, starting: saved.starting };
      status = { kind: "saved" };
    } else {
      status = { kind: "refused", sentence: answer.sentence };
    }
    const next = queued;
    queued = undefined;
    if (next !== undefined && !isSaved(next.humanness)) {
      void send(next.humanness);
      return;
    }
    if (timer === undefined) showSaved();
    render();
    options.onLevel?.(saved);
  }

  function stopWaiting(): void {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  }

  /** Sends what the slider shows now. */
  function commitShown(): void {
    stopWaiting();
    void send(draft.own ? draft.value : null);
  }

  /** Shows `level` as the task's own, unsent yet. */
  function choose(level: number): void {
    draft = { value: whole(level), own: true };
    if (status.kind !== "pending") status = { kind: "idle" };
    render();
  }

  range.addEventListener("input", () => choose(Number(range.value)));
  range.addEventListener("change", () => {
    choose(Number(range.value));
    commitShown();
  });
  range.addEventListener("keydown", (event) => {
    const next = keyed(event.key, draft.value);
    if (next === undefined) return;
    event.preventDefault();
    choose(next);
    stopWaiting();
    timer = setTimeout(commitShown, settleMs);
  });
  range.addEventListener("blur", () => {
    if (timer !== undefined) commitShown();
  });
  clear.addEventListener("click", () => {
    stopWaiting();
    draft = { value: saved.starting, own: false };
    render();
    void send(null);
  });

  render();
  return {
    element,
    show(level) {
      const read = tidy(level);
      if (!settled()) return;
      saved = read;
      showSaved();
      render();
    },
    level: () => saved,
    dispose() {
      if (timer !== undefined) commitShown();
    }
  };
}
