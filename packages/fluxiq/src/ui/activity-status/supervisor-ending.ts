// Why a project build's supervisor ended it, for the status the build ends on.
//
// A project build that its supervisor ended unfinished settled on Core's
// "Build failed: the supervisor ended it because it could not finish the
// Flow", which said that it ended and never why, and the toast read that
// sentence alone (A8 frozen pair 3, `run-mv9zn5ob-d929084d`, screenshot 00048,
// t649). Since t649 Core's last row says why itself: its failure carries the
// supervisor's screened reason (`endedBecause`), and the row reads "Build
// failed: the supervisor ended it because it could not finish the Flow: <why>"
// (`conversations/commands/progress.ts` in FluxIQ Core). Its title is cut at
// 160 characters, so the row's own text, Core's whole sentence, is said when
// it says more than the title.
//
// From an older Core whose last row says no why, the ending gets one: the
// words of the row Core says the supervisor's ending with just before ("The
// supervisor ended the build: ..."; its screened reason, then what is left),
// else the reason the supervisor gave as it decided to finish -- its last
// "Checking whether the Flow is finished" decision, which the chat already
// shows. Only the row that ends a build its supervisor ended is touched: a
// build its time limit or a budget stopped says its own why.
//
// Pure: no browser API, no clock.

import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";

/** Core's title for a decision to finish (`runtime/activity/wording/decision.ts` in FluxIQ Core). */
const FINISHING = "Checking whether the Flow is finished";
/**
 * Core's words for a build its supervisor ended: its ending row and the
 * build's last. An older Core says "The supervisor ended the build ..." and
 * "... the supervisor ended it ..."; a newer one says it in a person's words,
 * "FluxIQ could not finish the Flow" or "FluxIQ stopped with the Flow only
 * partly built" (t567 lane 4), which a time limit's words never are.
 */
const SUPERVISOR_ENDED = /\bsupervisor ended\b|\bFluxIQ could not finish the Flow\b|\bFluxIQ stopped with the Flow only partly built\b/iu;
/** A dotted id: a reason carrying one is not words, and is not said. */
const RAW_ID = /\b[a-z]+\.[a-z_]+/iu;
/** How much of a remembered why the last row must already hold to be taken as saying it. */
const SAME_WHY = 30;

/** What the row ending a supervisor-ended build is said with: Core's whole sentence in place of its cut title, or why, after it. */
export type SupervisorEndingWords = { sentence?: string; reason?: string };

export class SupervisorEnding {
  /** Each unit's last reason its supervisor gave for finishing, by `activityId`: the last fallback. */
  private readonly reasons = new Map<string, string>();
  /** Each unit's words on Core's row saying the supervisor's ending, by `activityId`. */
  private readonly endings = new Map<string, string>();

  /**
   * Takes one event, in order. For the row that ends a build its supervisor
   * ended, what its status is said with (`said` is that row's own status
   * sentence); undefined for any other row, and for one already saying all.
   */
  observe(event: ClientGatewayActivity, said: () => string): SupervisorEndingWords | undefined {
    const detail = event.detail;
    if (event.agent?.role === "supervisor" && detail?.kind === "thought") {
      const reason = plain(detail.text);
      // A decision opening ("Deciding the next step") says nothing; any other decision after a finishing one replaces it.
      if (!reason) return undefined;
      if (detail.title === FINISHING && !RAW_ID.test(reason)) this.reasons.set(event.activityId, reason);
      else this.reasons.delete(event.activityId);
      return undefined;
    }
    if (detail?.kind === "note" && event.final !== true && SUPERVISOR_ENDED.test(detail.title ?? "")) {
      const words = plain(detail.text);
      if (words && !RAW_ID.test(words)) this.endings.set(event.activityId, words);
      return undefined;
    }
    if (event.phase !== "failed" || event.final !== true) return undefined;
    const remembered = this.endings.get(event.activityId) ?? this.reasons.get(event.activityId);
    this.endings.delete(event.activityId);
    this.reasons.delete(event.activityId);
    if (![detail?.title, event.label].some((words) => typeof words === "string" && SUPERVISOR_ENDED.test(words))) return undefined;
    const sentence = said();
    // Core's whole sentence, where its title was cut: "Build failed: " and the row's text.
    const text = plain(detail?.text).replace(/[.\s]+$/u, "");
    const whole = text && SUPERVISOR_ENDED.test(text) && !RAW_ID.test(text) ? `${sentence.slice(0, sentence.indexOf(": ") + 2) || "Build failed: "}${lowerFirst(text)}` : undefined;
    const shown = whole !== undefined && whole.length > sentence.length ? whole : sentence;
    // A newer Core's last row says why already: what was remembered is said only where it does not.
    if (remembered === undefined || shown.toLowerCase().includes(remembered.slice(0, SAME_WHY).toLowerCase())) return shown === sentence ? undefined : { sentence: shown };
    return shown === sentence ? { reason: remembered } : { sentence: shown, reason: remembered };
  }
}

function plain(text: string | undefined): string {
  return text?.replace(/\s+/gu, " ").trim() ?? "";
}

/** "The supervisor ended it" reads "the supervisor ended it" after a colon; a word with a capital inside ("FluxIQ") stays. */
function lowerFirst(sentence: string): string {
  const word = /^\S+/u.exec(sentence)?.[0] ?? "";
  return /\p{Lu}/u.test(word.slice(1)) ? sentence : `${sentence.charAt(0).toLowerCase()}${sentence.slice(1)}`;
}
