// Folds Core's raw activity events into the one status a person reads
// (`ActivityDisplay`), at a pace a person can read.
//
// Core reports every seam of its work: a build asks the model, runs a tool,
// reads the result and asks again, often inside one second. Shown as they
// come, those events flip the status several times a second (the t185
// overlay did, and people called it flicker). The pacer keeps what they say
// and changes how often it is said:
//
// - `headline` names the unit of work ("Building your Flow", "Running your
//   Flow", "Fixing your Flow") and changes only when the work changes,
//   settles ("Flow ready", "Build failed") or needs the person ("Waiting for
//   you: finish the check on the page", "Paused: your turn on the page" while
//   Core holds a run the person took over). Those changes show at once, however
//   recently the detail changed (`headline.ts`, `unit-situation.ts`).
// - `detail` is Core's latest event in a person's words (`activityWording`:
//   no tool id or result code ever reaches it). It changes at most once per
//   `detailIntervalMs`: the first change in a quiet period shows at once, and
//   any that arrive before the period ends wait for its end, where only the
//   newest is shown. Nothing is dropped for good -- the last sentence always
//   reaches the screen -- so a stale one is never left showing. A sentence
//   that only repeats the headline is dropped (`isHeadlineEcho`).
// - This is the only pace. The panel's status row and the page overlay both
//   draw this display as it comes, so they say the same thing at the same
//   moment (D7 of the t174 UI review of run-musp8nz1-dbd3905a: the overlay
//   kept a dwell of its own and lagged the panel by most of a second). The
//   interval is long enough that any three seconds of paced changes show at
//   most two, which is what the Lab's UI review reads as steady.
// - A step that finished well is said by its action alone, never "— done":
//   the chat's card says Done, and the status must not still say "— done"
//   once the next step is under way (D6 of that review).
// - A decision being made ("Deciding the next step", Core's reasonless row
//   that opens every decision) does not replace a meaningful line: the last
//   one -- the step it ran, the stage it is in -- is held until something of
//   the work's own replaces it. Showing each opening row flashed the status
//   about once a second for a whole re-author (U9 of the run-musp39u8-9ac026ab
//   UI review). It shows only when nothing meaningful is up yet.
// - A step that starts after a decision shows at once: the status never says
//   "Deciding the next step", or the line held through the decision, beside
//   the card of the step the decision chose (D7 of the t174 review). A
//   decision takes the model's time, so this cannot make it flicker.
// - The model's words -- its reason for a step, a refused edit, a recovery
//   choice (`isModelThought`) -- are never the detail. The chat tells them;
//   the status keeps the unit's last action line, phase and step, and the
//   display is marked `kind: "thought"`. Such an event is not a change of the
//   detail: it neither starts the interval nor takes the place of an action
//   still waiting for it, so the action after a thought is not held back (D6
//   and D13 of the run-musp4h2f-72e8ed99 UI review). It still settles,
//   headlines and opens a unit of work like any other event, and it still
//   passes through `UnitSituation` and `RunRetry`.
// - A run that presses a failed step again is still running the Flow, not
//   fixing it: Core's recovery ladder keeps the headline "Running your Flow",
//   the failed step's row says why it failed ("The page was busy"), and the
//   ladder's choice to press it again -- a thought -- adds that it tries again
//   ("The page was busy, trying again"; D12 of the t174 review). A refusal the
//   ladder does not retry never reads "trying again" (t366). Only Core working
//   out a repair heads it "Fixing your Flow" (`run-retry.ts`).
// - A build test-running its Flow (a candidate's trial) is headed "Testing
//   your Flow", its failed step and retries told as a run's, never as a
//   repair, and its step count ends with it (`candidate-trial.ts`, t366).
// - A stopped ending -- "Run stopped", "Build stopped" -- is read from Core's
//   `stopped` field on the final event, set from the cancellation itself, never
//   from its words.
// - A run Core holds (`paused`) waits on the person like a question does: its
//   headline shows at once and is not paced, the work is not `working`, and
//   the detail is left empty (Core's "Paused: you have the page" only repeats
//   the headline; the overlay and the chat say what to do). The `running`
//   event Core sends when the run continues clears it at once.
// - A settling row that names the work it ends -- "Build stopped: ...", "Run
//   failed" -- heads the status by that name, whatever the event's subject
//   says: a creation build's ending read "Couldn't fix your Flow" (U4 of
//   run-muw60unq-591e23bd, `ending-kind.ts`). A unit that settled stays
//   settled: a later row in it that settles nothing (a late thought) does not
//   reopen it (run-muxkzdjw-31a13429).
// - `phase` and `step` move with `detail`, so the colour, the mark and the
//   step count cannot change faster than the words beside them. A repair of
//   the Flow itself is on no step of the run, so the count does not carry
//   into it (`unit-situation.ts`).
// - A settling event -- `final`, `failed` or waiting for the person -- changes
//   the headline or the outcome, so it skips the wait and replaces anything
//   still waiting. So does a new stage Core announces ("Judging the Flow", a
//   result check's verdict, the person's answer ending a wait): the status
//   follows the newest stage, never the step that finished before it.
// - The person's answer to a wait is not repeated as the detail: the thread
//   already says it.
// - A project build its supervisor ended says why (`supervisor-ending.ts`,
//   t649): Core's last row says it itself, in full where its title was cut;
//   from an older Core, its ending, then the words of Core's row saying the
//   supervisor's ending, else the reason the supervisor gave as it decided to
//   finish. The toast read "Build failed: the supervisor ended it because it
//   could not finish the Flow" and nothing more.
//
// Pure apart from the injected clock: no browser API, no network.

import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import type { ActivityDisplay } from "./activity-display.ts";
import { cutAtWord } from "./cut-at-word.ts";
import { isHeadlineEcho } from "./headline-echo.ts";
import { isModelThought } from "./model-thought.ts";
import { activityWording } from "./wording.ts";
import { CandidateTrial, type TrialState } from "./candidate-trial.ts";
import type { ActivityClock, ActivityTimer } from "./clock.ts";
import { endingKindOf } from "./ending-kind.ts";
import { activityHeadline } from "./headline.ts";
import type { ActivityHostWords } from "./host-words.ts";
import { RunRetry, type RetryState } from "./run-retry.ts";
import { SupervisorEnding, type SupervisorEndingWords } from "./supervisor-ending.ts";
import { UnitSituation, type UnitState } from "./unit-situation.ts";

/**
 * The shortest time between two paced changes of `detail`: more than half of
 * three seconds, so any three seconds show at most two. The overlay used to add
 * this on its own (a 1.6 s dwell over a 1.2 s pace); one pace for both surfaces
 * keeps them in step (D7).
 */
export const ACTIVITY_DETAIL_INTERVAL_MS = 1_600;

/** The most characters of Core's sentence kept, cut where a word ends (`cutAtWord`). Core already truncates; this bounds a misbehaving sender. */
const MAX_DETAIL = 160;
/** The most characters of a build's ending that carries its supervisor's reason (`supervisor-ending.ts`): Core's sentence, then why. */
const MAX_ENDING_DETAIL = 360;

/** The detail under a check's headline ("Waiting for you: finish the check on the page" in the extension), in place of the page action's own outcome. */
const CHECK_DETAIL = "Only a person can get past this page";

/** How a wait ends when the person settled it themselves (Core's `ClientGatewayActivityResolution`). */
const PERSON_RESOLUTIONS: ReadonlySet<string> = new Set(["answered", "allowed", "declined"]);

/**
 * What `activityWording` says for a decision not yet explained: Core's row
 * opening a decision, and the phase's wording for a Core that sends no detail.
 */
const UNDECIDED_SENTENCES: ReadonlySet<string> = new Set(["Deciding the next step", "Thinking about the next step"]);

/** Core's title on the result check's verdict row (`result-verification/verify.ts`). */
const RESULT_CHECK_TITLE = "Result check";

/** `activityWording`'s outcome for a step that worked. */
const OUTCOME_DONE = "done";

export type ActivityPacerOptions = {
  readonly clock: ActivityClock;
  /** Called with the new display whenever what a person sees changes. */
  readonly onChange: (display: ActivityDisplay) => void;
  /** How this host says a wait on the person; required, so no host inherits another's phrasing (`host-words.ts`). */
  readonly hostWords: ActivityHostWords;
  readonly detailIntervalMs?: number;
};

export class ActivityPacer {
  private shown: ActivityDisplay | null = null;
  private pending: ActivityDisplay | undefined;
  private readonly situation = new UnitSituation();
  private readonly retry = new RunRetry();
  private readonly trial = new CandidateTrial();
  private readonly ending = new SupervisorEnding();
  /** The shown display came from a decision still being made, whatever line it holds. */
  private shownDeciding = false;
  private pendingDeciding = false;
  private timer: ActivityTimer | undefined;
  private detailChangedAt = Number.NEGATIVE_INFINITY;
  private readonly intervalMs: number;

  constructor(private readonly options: ActivityPacerOptions) {
    this.intervalMs = options.detailIntervalMs ?? ACTIVITY_DETAIL_INTERVAL_MS;
  }

  /** What a person sees now; null before the first event. */
  display(): ActivityDisplay | null {
    return this.shown;
  }

  /** Takes one event, already known to be newer than every one before it. */
  accept(event: ClientGatewayActivity): void {
    const now = this.options.clock.now();
    // Every event passes through both, thoughts included, so a repair, a
    // check or a retry that a thought begins or ends still counts.
    const kind = subjectKindOf(event);
    const trial = this.trial.observe(event, kind);
    const unit = this.situation.observe(event, trial.testing || trial.endedNow);
    // A build's test runs its Flow as a run does, so its retries are told as a run's are.
    const retry = this.retry.observe(event, trial.testing ? "run" : kind);
    // Why the supervisor ended a project build, for the row that ends it (t649).
    const because = this.ending.observe(event, () => statusSentence(event));
    const latest = this.pending ?? this.shown;
    // A unit that settled -- failed or done -- is over: a row Core says in it
    // afterwards, a late thought or a step's echo, does not reopen it as work
    // under way (lane A round 4, `run-muxkzdjw-31a13429`: a thought after a
    // build's ending turned "Build failed" back into "Fixing your Flow").
    if (latest !== null && latest.activityId === event.activityId && (latest.outcome === "failed" || latest.outcome === "done") && outcomeOf(event) === null) return;
    if (isModelThought(event)) {
      this.acceptThought(thoughtDisplayFor(event, latest, unit, retry, trial, this.options.hostWords), now);
      return;
    }
    const next = holdMeaningfulLine(event, displayFor(event, this.shown, unit, retry, trial, this.options.hostWords, because), latest);
    const atOnce = opensStage(event) || (this.shownDeciding && startsStep(event));
    this.offer(next, isDeciding(event), atOnce, now);
  }

  /** Stops a waiting change; the display keeps what it last showed. */
  dispose(): void {
    this.cancelPending();
  }

  /**
   * One of the model's thoughts, as `next`: the action line it would show next
   * (an action still waiting for the interval, else the one up) with what the
   * thought says of the work itself. A change of headline or outcome shows at
   * once, carrying any waiting action with it; a thought that leaves the line
   * as it is is folded in quietly, and a waiting action keeps its place and
   * its turn. Only a run's retry line coming or going changes the detail on a
   * thought, and that change is paced like any other.
   */
  private acceptThought(next: ActivityDisplay, now: number): void {
    const latest = this.pending ?? this.shown;
    const deciding = this.pending !== undefined ? this.pendingDeciding : this.shownDeciding;
    if (!this.showsAtOnce(next) && latest !== null && next.detail === latest.detail) {
      if (this.pending === undefined) this.show(next, now, deciding);
      return;
    }
    this.offer(next, deciding, false, now);
  }

  /** Shows `next` now when it may skip the pace, else holds it for the interval's end. */
  private offer(next: ActivityDisplay, deciding: boolean, atOnce: boolean, now: number): void {
    if (atOnce || this.showsAtOnce(next) || now - this.detailChangedAt >= this.intervalMs) {
      this.cancelPending();
      this.show(next, now, deciding);
      return;
    }
    this.pending = next;
    this.pendingDeciding = deciding;
    this.timer ??= this.options.clock.setTimeout(() => this.showPending(), this.detailChangedAt + this.intervalMs - now);
  }

  /** A new unit of work, or a new headline or outcome for this one (a repair, a check, settling, resuming): it shows now. */
  private showsAtOnce(next: ActivityDisplay): boolean {
    const shown = this.shown;
    return shown === null || shown.activityId !== next.activityId || shown.headline !== next.headline || shown.outcome !== next.outcome;
  }

  private showPending(): void {
    this.timer = undefined;
    const next = this.pending;
    this.pending = undefined;
    if (next) this.show(next, this.options.clock.now(), this.pendingDeciding);
  }

  private cancelPending(): void {
    if (this.timer !== undefined) this.options.clock.clearTimeout(this.timer);
    this.timer = undefined;
    this.pending = undefined;
  }

  private show(next: ActivityDisplay, now: number, deciding: boolean): void {
    const previous = this.shown;
    this.shown = next;
    this.shownDeciding = deciding;
    if (previous === null || next.detail !== previous.detail) this.detailChangedAt = now;
    if (previous === null || visiblyDiffers(previous, next)) this.options.onChange(next);
  }
}

function displayFor(event: ClientGatewayActivity, previous: ActivityDisplay | null, unit: UnitState, retry: RetryState, trial: TrialState, words: ActivityHostWords, because?: SupervisorEndingWords): ActivityDisplay {
  // A settling row names the work it ends, which outweighs the subject
  // (`ending-kind.ts`), and the unit keeps that name for every row after it:
  // a thought after a build's ending took the run's headline again, "Couldn't
  // fix your Flow | Build stopped: a budget ran out" (run-mux74k5q-1c3c2127).
  const settledAs = previous !== null && previous.activityId === event.activityId && (previous.outcome === "failed" || previous.outcome === "done") ? previous.subjectKind : undefined;
  const subjectKind = endingKindOf(event) ?? settledAs ?? subjectKindOf(event);
  // A check only the person can answer holds the work until the page lets it
  // through; Core's own settling and waiting events still say what they say.
  const outcome = outcomeOf(event) ?? (unit.check ? "waiting" : null);
  const working = outcome === null;
  const headline = activityHeadline(subjectKind, outcome, words, {
    stopped: event.stopped === true,
    // A run pressing a failed step again is not a repair (D12), and nor is
    // anything a candidate trial's run reports (`candidate-trial.ts`).
    repairing: unit.repairing && retry.repairing && !trial.testing,
    testing: trial.testing,
    waitingOn: event.phase === "waiting_permission" ? "answer" : event.phase === "paused" ? "paused" : "check"
  });
  // The person's own answer is said in the thread (the ask and its card); as
  // the status it would be the third telling of one press (D7).
  const detail = personAnswered(event) || event.phase === "paused" ? null
    : because !== undefined ? bounded(because.reason === undefined ? because.sentence ?? statusSentence(event) : withReason(because.sentence ?? statusSentence(event), because.reason), MAX_ENDING_DETAIL)
      : bounded(unit.checkReportedNow ? CHECK_DETAIL : trial.line ?? retry.line ?? statusSentence(event));
  const sameUnit = previous !== null && previous.activityId === event.activityId;
  // A run's step events carry the step; the events between them ("Run
  // started", a note) keep the step last said, so the count does not blink out
  // -- but not into a repair of the Flow itself, which is on no step of the
  // run (U2 of t194: "Step 5 of 5" for a four-minute re-author), and not
  // across either end of a candidate trial, whose run counts its own steps.
  const carried = sameUnit && !unit.rebuilding && !trial.startedNow && !trial.endedNow ? previous.step : null;
  // A held run keeps the step it will continue from, so the chat can say it.
  const step = working || event.phase === "paused" ? stepOf(event.step) ?? carried : null;
  return {
    activityId: event.activityId,
    subjectKind,
    // A trial's failed step reports Core's `repairing` phase; the trial is
    // still only running the Flow, so it is coloured as running.
    phase: trial.testing && event.phase === "repairing" ? "running" : event.phase,
    headline,
    detail: isHeadlineEcho(headline, detail) ? null : detail,
    step,
    working,
    outcome,
    sequence: event.sequence,
    kind: "action"
  };
}

/**
 * The display for one of the model's thoughts: the unit's headline, working
 * state and outcome from the event, and the detail, phase and step of `base`,
 * the action line it keeps -- or none, when the thought opens the unit. A
 * run's retry line is FluxIQ's own status, not the model's words: a recovery
 * choice keeps it up, and the thought that ends the retry takes it down.
 */
function thoughtDisplayFor(event: ClientGatewayActivity, base: ActivityDisplay | null | undefined, unit: UnitState, retry: RetryState, trial: TrialState, words: ActivityHostWords): ActivityDisplay {
  const kept = base && base.activityId === event.activityId ? base : null;
  const own = displayFor(event, kept, unit, retry, trial, words);
  const keptLine = kept && kept.detail !== retry.ended ? kept.detail : null;
  // A test's opening line is FluxIQ's own words too (`candidate-trial.ts`).
  const line = retry.line ?? (trial.startedNow ? trial.line : null) ?? keptLine;
  return {
    ...own,
    phase: kept?.phase ?? own.phase,
    detail: line !== null && !isHeadlineEcho(own.headline, line) ? line : null,
    step: own.working ? (kept && !unit.rebuilding ? kept.step : null) ?? own.step : null,
    kind: "thought"
  };
}

/**
 * `next`, keeping `latest`'s line when `event` is only a decision being made
 * and `latest` -- the newest display, shown or still waiting for its turn --
 * already says something meaningful about the same work under the same
 * headline. The step is `next`'s own, so a repair still drops the run's count.
 */
function holdMeaningfulLine(event: ClientGatewayActivity, next: ActivityDisplay, latest: ActivityDisplay | null | undefined): ActivityDisplay {
  if (!latest || !decisionUnderWay(event) || next.detail === null || !UNDECIDED_SENTENCES.has(next.detail)) return next;
  if (latest.activityId !== next.activityId || !latest.working || !next.working || latest.headline !== next.headline) return next;
  if (latest.detail === null || UNDECIDED_SENTENCES.has(latest.detail)) return next;
  return { ...next, detail: latest.detail, phase: latest.phase };
}

/** A decision Core has opened and not yet explained: a thought row with no reason, or a bare thinking event. */
function decisionUnderWay(event: ClientGatewayActivity): boolean {
  const detail = event.detail;
  if (detail === undefined) return event.phase === "thinking";
  return detail.kind === "thought" && (detail.text?.trim() ?? "") === "" && detail.status !== "failed";
}

/** A decision still being made: Core's "Deciding the next step" row, or a thinking event with no row. */
function isDeciding(event: ClientGatewayActivity): boolean {
  const detail = event.detail;
  return detail === undefined ? event.phase === "thinking" : detail.kind === "thought" && detail.status === "started";
}

/** A page step starting: the event that puts a working card in the chat. */
function startsStep(event: ClientGatewayActivity): boolean {
  return event.detail?.kind === "tool" && event.detail.status === "started";
}

/** What the status says of `event`: its words, and a step that finished well by its action alone (D6). */
function statusSentence(event: ClientGatewayActivity): string {
  const wording = activityWording(event);
  const finishedWell = event.detail?.kind === "tool" && event.detail.status === "succeeded" && wording.outcome === OUTCOME_DONE;
  return finishedWell ? wording.action : wording.sentence;
}

/** Core's row closing a wait with what the person did: pressed Continue or Stop, answered, allowed or refused. */
function personAnswered(event: ClientGatewayActivity): boolean {
  const detail = event.detail;
  if (detail?.kind !== "ask" || (detail.status !== "succeeded" && detail.status !== "failed")) return false;
  return detail.resolution === undefined ? detail.status === "succeeded" : PERSON_RESOLUTIONS.has(detail.resolution);
}

/**
 * Core announcing a new stage of the work -- "Judging the Flow", a result
 * check's verdict, the end of a wait on the person -- rather than one more
 * step inside it. A stage comes a few times a unit, so it is never what makes
 * the status flicker, and a person reading the step that finished before it
 * would be reading what FluxIQ is no longer doing (D10: the status said
 * "clicking “Add to cart” — done" while the chat said "Judging the Flow").
 * A `note` with a tool id is Core's bookkeeping, not a stage, and the
 * completion check's rows, which open and close inside a build's step loop,
 * are paced like the steps around them.
 */
function opensStage(event: ClientGatewayActivity): boolean {
  const detail = event.detail;
  if (!detail) return false;
  if (detail.kind === "note") return !detail.ref;
  if (detail.kind === "check") return detail.title === RESULT_CHECK_TITLE && detail.status !== "started";
  return personAnswered(event);
}

function outcomeOf(event: ClientGatewayActivity): ActivityDisplay["outcome"] {
  if (event.phase === "failed") return "failed";
  if (event.phase === "waiting_permission" || event.phase === "paused") return "waiting";
  if (event.phase === "done" || event.final === true) return "done";
  return null;
}

function subjectKindOf(event: ClientGatewayActivity): ActivityDisplay["subjectKind"] {
  const kind: unknown = (event.subject as { kind?: unknown } | undefined)?.kind;
  if (kind === "run" || kind === "build") return kind;
  return event.activityId.startsWith("run:") ? "run" : "build";
}

function stepOf(step: ClientGatewayActivity["step"]): ActivityDisplay["step"] {
  if (!step || !Number.isFinite(step.index) || step.index < 1) return null;
  return { index: Math.floor(step.index), count: Number.isFinite(step.count) && step.count >= 0 ? Math.floor(step.count) : 0 };
}

function bounded(text: string, max = MAX_DETAIL): string | null {
  const collapsed = text.replace(/\s+/gu, " ").trim();
  if (!collapsed) return null;
  return cutAtWord(collapsed, max);
}

/** An ending that says it ended, then why, as two sentences: "Build failed: the supervisor ended it .... The item can't be had this way." */
function withReason(sentence: string, reason: string): string {
  const said = sentence.trim().replace(/[.\s]+$/u, "");
  const why = reason.trim();
  return `${said}. ${why.charAt(0).toUpperCase()}${why.slice(1)}${/[.!?…]$/u.test(why) ? "" : "."}`;
}

function visiblyDiffers(a: ActivityDisplay, b: ActivityDisplay): boolean {
  return a.activityId !== b.activityId
    || a.headline !== b.headline
    || a.detail !== b.detail
    || a.phase !== b.phase
    || a.working !== b.working
    || a.outcome !== b.outcome
    || a.step?.index !== b.step?.index
    || a.step?.count !== b.step?.count;
}
