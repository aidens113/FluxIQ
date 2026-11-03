// What the live line at the end of the chat says while FluxIQ works: the
// paced display's headline and detail (`ChatActivityState.display`), and
// the step. The background paces the display, so this line changes at a
// readable rate however fast Core's events arrive. Between a send and the
// first activity it says the message is on its way. While the work waits for
// the person (a robot check, Core's person-needed ask) it stays up and says
// what Core asked of them, because "Waiting for you" alone says nothing of
// what to do. When the question is in a thread not on screen, it offers the
// one action that puts it in front of the person: opening that thread
// (`action`, "Show the question"). No DOM.

import type { ChatActivityState } from "../ports/index.ts";
import type { ActivityDisplay } from "fluxiq/ui";
import { stepText } from "./step-text.ts";

/** The live line's words; null hides it. `action` labels its one button, "" for none. */
export type LiveLineModel = { headline: string; detail: string; step: string; waiting: boolean; action: string };

const SENDING = "Sending your message";
/** The button that opens the thread holding the question the work waits on. */
const SHOW_QUESTION = "Show the question";

/**
 * The live line for `display`, or for a send still on its way.
 * `questionElsewhere` says the question the work waits on is in a thread not on screen.
 */
export function liveLineModel(display: ActivityDisplay | null | undefined, sending: boolean, questionElsewhere = false): LiveLineModel | null {
  if (display?.working === true) {
    return {
      headline: display.headline.trim() || "Working",
      detail: display.detail?.trim() ?? "",
      step: stepText(display.step ?? undefined) ?? "",
      waiting: false,
      action: ""
    };
  }
  if (display?.outcome === "waiting") {
    return {
      headline: display.headline.trim() || "Waiting for you",
      detail: display.detail?.trim() ?? "",
      step: "",
      waiting: true,
      action: questionElsewhere ? SHOW_QUESTION : ""
    };
  }
  return sending ? { headline: SENDING, detail: "", step: "", waiting: false, action: "" } : null;
}
