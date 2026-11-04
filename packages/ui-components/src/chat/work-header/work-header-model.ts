// What the work header says while FluxIQ works: its state ("Working",
// "Waiting for you", "Sending your message"), the one short line of what it is
// doing now, the cost segment and, while the work waits on a question held in
// another thread, the one button that opens it. It replaces the Stop row and
// the live line (`view/live-line-model.ts`). The elapsed time is not here: it
// ticks, and the view reads it from the clock. No DOM.
//
// The line beneath is the current step only, never a second copy of a step
// message: Core's latest status sentence (`display.detail`), with the run's
// "Step N of M" before it. While the work waits for the person it is what the
// work waits for, once: the headline's words after "Waiting for you:", not the
// ask's own sentence, which is in the stream beside its buttons.

import type { ActivityDisplay } from "fluxiq/ui";
import { costWords } from "./cost-words.ts";

/** What the host knows of the unit of work's time and spend; every field optional. */
export type WorkMeter = { startedAtMs?: number; usd?: number; budgetUsd?: number };

/** The inputs the header reads. */
export type WorkHeaderInput = {
  /** The paced status (`ChatActivityState.display`). */
  display: ActivityDisplay | null | undefined;
  /** True between the person's send and Core's first activity. */
  sending: boolean;
  /** The question the work waits on is in a thread not on screen. */
  questionElsewhere?: boolean;
  /** The question the work waits on is in the thread on screen, so the header only points at it. */
  questionHere?: boolean;
  /** Stop is offered (the raw live subject is a build or run) though no display has arrived yet. */
  stopOffered?: boolean;
  meter?: WorkMeter;
  /** "Using what I saved from Tuesday.", while the attempt works from saved work. Shown only while working. */
  usingSaved?: string;
};

/** The header's words; null hides it. `action` labels its one button, "" for none. */
export type WorkHeaderModel = {
  state: "working" | "waiting" | "sending";
  label: string;
  now: string;
  cost: string;
  limit: string;
  action: string;
  /** "Using what I saved from Tuesday.", or "" for none. */
  saved: string;
};

const SENDING = "Sending your message";
/** The button that opens the thread holding the question the work waits on. */
const SHOW_QUESTION = "Show the question";
/** All the header says of a question on screen: the question itself says what to do. */
const QUESTION_ABOVE = "The question is above.";
const WAITING_PREFIX = /^(waiting for you|paused)\s*:\s*/iu;

/** The header for `input`, or null when nothing works, waits or is on its way. */
export function workHeaderModel(input: WorkHeaderInput): WorkHeaderModel | null {
  const { display, sending } = input;
  const cost = costWords(input.meter?.usd, input.meter?.budgetUsd);
  if (display?.working === true) {
    const step = display.step !== null && display.step !== undefined && Number.isInteger(display.step.index) && display.step.index >= 1
      ? display.step.count >= display.step.index ? `Step ${display.step.index} of ${display.step.count}` : `Step ${display.step.index}`
      : "";
    const said = display.detail?.trim() || display.headline.trim();
    return { state: "working", label: "Working", now: [step, said].filter(Boolean).join(" · "), cost: cost.text, limit: cost.limit, action: "", saved: input.usingSaved ?? "" };
  }
  if (display?.outcome === "waiting") {
    const headline = display.headline.trim();
    const rest = headline.replace(WAITING_PREFIX, "");
    const now = rest !== headline || headline === "" ? capitalised(rest) : headline;
    return {
      state: "waiting",
      label: display.phase === "paused" ? "Paused" : "Waiting for you",
      now: input.questionHere === true ? QUESTION_ABOVE : now || (display.detail?.trim() ?? ""),
      cost: cost.text,
      limit: cost.limit,
      action: input.questionElsewhere === true ? SHOW_QUESTION : "",
      saved: ""
    };
  }
  if (sending) return { state: "sending", label: SENDING, now: "", cost: "", limit: "", action: "", saved: "" };
  if (input.stopOffered === true) return { state: "working", label: "Working", now: "", cost: cost.text, limit: cost.limit, action: "", saved: input.usingSaved ?? "" };
  return null;
}

function capitalised(text: string): string {
  return text === "" ? "" : text.charAt(0).toUpperCase() + text.slice(1);
}
