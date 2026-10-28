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
//   Core holds a run the person took over) (`headline.ts`,
//   `unit-situation.ts`). Settling, a wait on the person and the work going on
//   after that wait show at once. Any other change of headline waits its turn
//   like a detail's, and a headline once up stays at least
//   `ACTIVITY_HEADLINE_DWELL_MS` (t753: a new headline used to skip the pace,
//   and round 5's line changed one to three times in three seconds in about
//   half of its samples).
// - `detail` is Core's latest event in a person's words (`activityWording`:
//   no tool id or result code ever reaches it). The line changes at most once
//   per `detailIntervalMs`: the first change in a quiet period shows at once,
//   and any that arrive before the period ends wait for its end, where only
//   the newest is shown. Nothing is dropped for good -- the last sentence
//   always reaches the screen -- so a stale one is never left showing. A
//   change that comes back to what is shown before its turn shows nothing:
//   rows that alternate and return are no change of state. A sentence that
//   only repeats the headline is dropped, and one that opens with it keeps
//   only what follows (`activityWithoutHeadline`); a clause that repeats an
//   earlier one is said once (`steady/said-once.ts`).
// - This is the only pace. The panel's status row and the page overlay both
//   draw this display as it comes, so they say the same thing at the same
//   moment (D7 of the t174 UI review of run-musp8nz1-dbd3905a: the overlay
//   kept a dwell of its own and lagged the panel by most of a second). The
//   interval is long enough that any three seconds of paced changes show at
//   most two, which is what the Lab's UI review reads as steady.
// - A project build's agents share one unit of work. Each keeps its own state
//   (`steady/agent-states.ts`), and the line follows one agent while it keeps
//   working: another's rows wait until it has been quiet for
//   `AGENT_FOCUS_HOLD_MS`, unless the work settles or waits on the person
//   (`steady/agent-focus.ts`). Their rows alternated, and so did the line.
// - A step that finished well is said by its action alone, never "— done":
//   the chat's card says Done, and the status must not still say "— done"
//   once the next step is under way (D6 of that review).
// - A decision being made ("Deciding the next step", Core's reasonless row
//   that opens every decision) does not replace a meaningful line: the last
//   one -- the step it ran, the stage it is in -- is held until something of
//   the work's own replaces it. Showing each opening row flashed the status
//   about once a second for a whole re-author (U9 of the run-musp39u8-9ac026ab
//   UI review). It shows only when nothing meaningful is up yet. A decision
//   takes the model's time, so the step it chose is almost always past the
//   interval and shows when its card does (D7 of the t174 review).
// - The model's words -- its reason for a step, a refused edit, a recovery
//   choice (`isModelThought`) -- are never the detail. The chat tells them;
//   the status keeps the unit's last action line, phase and step, and the
//   display is marked `kind: "thought"`. Such an event is not a change of the
//   detail: it neither starts the interval nor takes the place of an action
//   still waiting for it, so the action after a thought is not held back (D6
//   and D13 of the run-musp4h2f-72e8ed99 UI review). It still settles,
//   headlines and opens a unit of work like any other event, and it still
//   passes through `UnitSituation` and `RunRetry`.
// - A guard's refusal ("Not done: opening ... — it was already tried exactly
//   this way") is never the detail either: the newest card already says it,
//   and the line keeps what it said, as for a thought (t753).
// - A check that stood and cleared before anyone was asked, which Core tells
//   after the fact as a wait and its end (`activity/ask/cleared-wait.ts`),
//   changes nothing on the line: it read "Waiting for you" for a moment, then
//   "The check cleared on its own after 10 s." with nothing to explain it.
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
//   Core running the parts before a part only to get the page ready is
//   neither: it reads "Getting the page ready" and counts no step
//   (`steady/page-preparation.ts`), and a reset brief reads "Putting the site
//   back" (t753). A test checked against the recorded run reads as that,
//   counting its steps as a test does (`steady/recorded-check.ts`); a test
//   refused before it ran never reads as testing, and its closing line says
//   it didn't run and why (`steady/test-ending.ts`, t769 b13).
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
//   into it (`unit-situation.ts`). A run keeps the count it first said: a
//   part's own steps, which count among themselves, leave the run's step up
//   (`steady/run-count.ts`; "Step 2 of 3" then "Step 1 of 5").
// - A settling event -- `final`, `failed` or waiting for the person -- changes
//   the headline or the outcome, so it skips the wait and replaces anything
//   still waiting. A new stage Core announces ("Judging the Flow", a result
//   check's verdict) waits its turn like any change, and replaces whatever
//   was waiting: the status follows the newest stage, never the step that
//   finished before it (D10).
// - The person's answer to a wait is not repeated as the detail: the thread
//   already says it.
// - A project build its supervisor ended says why (`supervisor-ending.ts`,
//   t649): Core's last row says it itself, in full where its title was cut;
//   from an older Core, its ending, then the words of Core's row saying the
//   supervisor's ending, else the reason the supervisor gave as it decided to
//   finish. The toast read "Build failed: the supervisor ended it because it
//   could not finish the Flow" and nothing more.
// - A sentence Core cut inside a word to its 160-character bound is shown cut
//   where a word ends ("address is t…" read as a word of its own, t753).
//
// Pure apart from the injected clock: no browser API, no network.

import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import type { ActivityDisplay } from "./activity-display.ts";
import { cutAtWord } from "./cut-at-word.ts";
import { activityWithoutHeadline } from "./headline-echo.ts";
import { isModelThought } from "./model-thought.ts";
import { activityWording } from "./wording.ts";
import type { TrialState } from "./candidate-trial.ts";
import type { ActivityClock, ActivityTimer } from "./clock.ts";
import { endingKindOf } from "./ending-kind.ts";
import { activityHeadline } from "./headline.ts";
import type { ActivityHostWords } from "./host-words.ts";
import { RunRetry, type RetryState } from "./run-retry.ts";
import { activityAgentKey, activitySaidOnce, AgentFocus, AgentStates, type CountedStep, type PreparationState, type RecordedCheckState } from "./steady/index.ts";
import { SupervisorEnding, type SupervisorEndingWords } from "./supervisor-ending.ts";
import type { UnitState } from "./unit-situation.ts";

/**
 * The shortest time between two paced changes of the line: more than half of
 * three seconds, so any three seconds show at most two. The overlay used to add
 * this on its own (a 1.6 s dwell over a 1.2 s pace); one pace for both surfaces
 * keeps them in step (D7).
 */
export const ACTIVITY_DETAIL_INTERVAL_MS = 1_600;

/** The least time a headline stays up before another that does not settle or wait replaces it (t753). */
export const ACTIVITY_HEADLINE_DWELL_MS = 3_200;

/** How long the agent the line follows may be quiet before another's rows take it over (t753). */
const AGENT_FOCUS_HOLD_MS = 4_000;
/** How many units of work the pacer remembers having shown, so only a unit's first display counts as new. */
const UNITS_REMEMBERED = 16;

/** The most characters of Core's sentence kept, cut where a word ends (`cutAtWord`). Core already truncates; this bounds a misbehaving sender. */
const MAX_DETAIL = 160;
/** The most characters of a build's ending that carries its supervisor's reason (`supervisor-ending.ts`): Core's sentence, then why. */
const MAX_ENDING_DETAIL = 360;
/** Core's bound on a label or title, which it cuts to by count with an ellipsis in its last place (Core's `activity/bounded.ts`). */
const CORE_BOUND = 160;

/** The detail under a check's headline ("Waiting for you: finish the check on the page" in the extension), in place of the page action's own outcome. */
const CHECK_DETAIL = "Only a person can get past this page";

/** How a wait ends when the person settled it themselves (Core's `ClientGatewayActivityResolution`). */
const PERSON_RESOLUTIONS: ReadonlySet<string> = new Set(["answered", "allowed", "declined"]);

/**
 * What `activityWording` says for a decision not yet explained: Core's row
 * opening a decision, and the phase's wording for a Core that sends no detail.
 */
const UNDECIDED_SENTENCES: ReadonlySet<string> = new Set(["Deciding the next step", "Thinking about the next step"]);

/** `activityWording`'s outcome for a step that worked. */
const OUTCOME_DONE = "done";

/** Core's title on both rows of a check that cleared by itself, told after the fact (`activity/ask/cleared-wait.ts`). */
const CLEARED_WAIT_TITLE = "Waited for a check to clear";

/** A sentence saying a call was refused before it was made: "Not done: ...", or an outcome "— not done: ...". */
const REFUSED = /^not done\b|— not done\b/iu;

/** A run's step row in Core's words, and the action after it (`activity/step/started.ts`). */
const RUN_STEP = /^Running step \d+(?: of \d+)?(?: on page \d+)?(?:: (.+))?$/u;

export type ActivityPacerOptions = {
  readonly clock: ActivityClock;
  /** Called with the new display whenever what a person sees changes. */
  readonly onChange: (display: ActivityDisplay) => void;
  /** How this host says a wait on the person; required, so no host inherits another's phrasing (`host-words.ts`). */
  readonly hostWords: ActivityHostWords;
  readonly detailIntervalMs?: number;
  readonly headlineDwellMs?: number;
};

/** What the unit's trackers make of one event, which its display is read from. */
type Reading = {
  readonly unit: UnitState;
  readonly retry: RetryState;
  readonly trial: TrialState;
  readonly preparation: PreparationState;
  readonly recorded: RecordedCheckState;
  /** The step the run is on, by the count it first said; null for a row with no step. */
  readonly counted: CountedStep | null;
  /** The display shown came from the same agent. */
  readonly sameAgent: boolean;
};

/** A display waiting for its turn, with who said it. */
type Waiting = { readonly display: ActivityDisplay; readonly deciding: boolean; readonly key: string };

export class ActivityPacer {
  private shown: ActivityDisplay | null = null;
  private shownKey = "";
  private pending: Waiting | undefined;
  /** The newest row of an agent the line is not following, for when that agent goes quiet. */
  private parked: Waiting | undefined;
  private readonly unitsShown = new Set<string>();
  private readonly agents = new AgentStates();
  private readonly focus = new AgentFocus(AGENT_FOCUS_HOLD_MS);
  private readonly retry = new RunRetry();
  private readonly ending = new SupervisorEnding();
  /** The shown display came from a decision still being made, whatever line it holds. */
  private shownDeciding = false;
  private timer: ActivityTimer | undefined;
  private timerDue = 0;
  private parkTimer: ActivityTimer | undefined;
  private changedAt = Number.NEGATIVE_INFINITY;
  private headlineSince = Number.NEGATIVE_INFINITY;
  private readonly intervalMs: number;
  private readonly headlineDwellMs: number;

  constructor(private readonly options: ActivityPacerOptions) {
    this.intervalMs = options.detailIntervalMs ?? ACTIVITY_DETAIL_INTERVAL_MS;
    this.headlineDwellMs = options.headlineDwellMs ?? Math.max(ACTIVITY_HEADLINE_DWELL_MS, 2 * this.intervalMs);
  }

  /** What a person sees now; null before the first event. */
  display(): ActivityDisplay | null {
    return this.shown;
  }

  /** Takes one event, already known to be newer than every one before it. */
  accept(event: ClientGatewayActivity): void {
    const now = this.options.clock.now();
    // Every event passes through its agent's trackers, thoughts included, so
    // a repair, a check, a test or a retry that a thought begins or ends still counts.
    const kind = subjectKindOf(event);
    const agent = this.agents.of(event);
    const preparation = agent.preparation.observe(event);
    const recorded = agent.recorded.observe(event);
    const trial = agent.trial.observe(event, kind, preparation.preparing ? "preparing" : recorded.checking ? "recorded" : null);
    // A run made aside from a test on the site: getting the page ready, or checking against the recorded run.
    const aside = preparation.preparing || recorded.checking;
    const unit = agent.situation.observe(event, trial.testing || trial.endedNow || aside);
    if (trial.startedNow || trial.endedNow || preparation.startedNow || recorded.startedNow || unit.rebuilding) agent.count.restart();
    // A build's test, getting its page ready and checking it against the recorded run run a Flow as a run does, so their retries are told as a run's are.
    const retry = this.retry.observe(event, trial.testing || aside ? "run" : kind);
    // Why the supervisor ended a project build, for the row that ends it (t649).
    const because = this.ending.observe(event, () => statusSentence(event));
    const step = stepOf(event.step);
    const counted = step !== null && !preparation.preparing ? agent.count.observe(step) : null;
    const latest = this.pending?.display ?? this.shown;
    // A unit that settled -- failed or done -- is over: a row Core says in it
    // afterwards, a late thought or a step's echo, does not reopen it as work
    // under way (lane A round 4, `run-muxkzdjw-31a13429`: a thought after a
    // build's ending turned "Build failed" back into "Fixing your Flow").
    if (latest !== null && latest.activityId === event.activityId && isSettled(latest) && outcomeOf(event) === null) return;
    if (isClearedWait(event)) return;
    const key = `${event.activityId}|${activityAgentKey(event)}`;
    const reading: Reading = { unit, retry, trial, preparation, recorded, counted, sameAgent: this.shownKey === key };
    // A refusal said verbatim -- Core's own sentence, not a line of FluxIQ's own such as a test's failed step.
    const quiet = isModelThought(event) || REFUSED.test(sentenceFor(event, reading, because) ?? "");
    const next = quiet
      ? quietDisplayFor(event, latest, reading, this.options.hostWords, isModelThought(event) ? "thought" : "action")
      : holdMeaningfulLine(event, displayFor(event, this.shown, reading, this.options.hostWords, because), latest);
    if (!this.focus.admits(key, now, this.urgent(next, key))) {
      if (!quiet) this.park({ display: next, deciding: isDeciding(event), key }, now);
      return;
    }
    if (this.parked?.key === key) this.parked = undefined;
    if (isSettled(next)) this.settled(next);
    if (quiet) this.acceptQuiet(next, key, now);
    else this.offer({ display: next, deciding: isDeciding(event), key }, now);
  }

  /** Stops a waiting change; the display keeps what it last showed. */
  dispose(): void {
    this.cancelPending();
    if (this.parkTimer !== undefined) this.options.clock.clearTimeout(this.parkTimer);
    this.parkTimer = undefined;
    this.parked = undefined;
  }

  /**
   * A thought or a refusal, as `next`: the action line it would show next (an
   * action still waiting for its turn, else the one up) with what the event
   * says of the work itself. A change of headline or outcome is offered like
   * any change, carrying any waiting action with it; an event that leaves the
   * line as it is is folded in quietly, and a waiting action keeps its place
   * and its turn. Only a run's retry line coming or going changes the detail
   * on a thought, and that change is paced like any other.
   */
  private acceptQuiet(next: ActivityDisplay, key: string, now: number): void {
    const latest = this.pending?.display ?? this.shown;
    const deciding = this.pending !== undefined ? this.pending.deciding : this.shownDeciding;
    if (this.headedAsShown(next) && !this.urgent(next, key) && latest !== null && next.detail === latest.detail) {
      if (this.pending === undefined) this.show({ display: next, deciding, key }, now);
      return;
    }
    this.offer({ display: next, deciding, key }, now);
  }

  /** Shows `next` now when it may skip the pace or its turn has come, else holds it for its turn. */
  private offer(next: Waiting, now: number): void {
    // Back to what is shown before its turn: the state did not change, so nothing shows.
    if (this.shown !== null && !visiblyDiffers(this.shown, next.display)) {
      this.cancelPending();
      this.shown = next.display;
      this.shownDeciding = next.deciding;
      this.shownKey = next.key;
      return;
    }
    const due = this.dueAt(next.display);
    if (this.urgent(next.display, next.key) || now >= due) {
      this.cancelPending();
      this.show(next, now);
      return;
    }
    this.pending = next;
    if (this.timer !== undefined && this.timerDue !== due) {
      this.options.clock.clearTimeout(this.timer);
      this.timer = undefined;
    }
    this.timerDue = due;
    this.timer ??= this.options.clock.setTimeout(() => this.showPending(), due - now);
  }

  /**
   * The line must change now: the first display, the work settling or
   * waiting on the person, the work going on after that wait, or a new unit
   * of work after one that settled.
   */
  private urgent(next: ActivityDisplay, key: string): boolean {
    const shown = this.shown;
    if (shown === null || this.isNewUnit(next.activityId)) return true;
    // What the person is waited on for changed: a question, a check, a hold.
    if (next.outcome === "waiting" && shown.outcome === "waiting") return next.headline !== shown.headline;
    if (next.outcome === shown.outcome) return false;
    return next.outcome !== null || shown.outcome !== "waiting" || this.shownKey === key;
  }

  /** `activityId` names a unit of work not shown before: its first display shows at once. */
  private isNewUnit(activityId: string): boolean {
    return this.shown !== null && this.shown.activityId !== activityId && !this.unitsShown.has(activityId);
  }

  /** When `next` may show: the interval after the last change, and for a new headline not before the shown one had its dwell. */
  private dueAt(next: ActivityDisplay): number {
    const paced = this.changedAt + this.intervalMs;
    return this.headedAsShown(next) ? paced : Math.max(paced, this.headlineSince + this.headlineDwellMs);
  }

  /** `next` says the same unit, headline and outcome as the display shown. */
  private headedAsShown(next: ActivityDisplay): boolean {
    const shown = this.shown;
    return shown !== null && shown.activityId === next.activityId && shown.headline === next.headline && shown.outcome === next.outcome;
  }

  /** Holds the newest row of an agent the line is not following until the followed one goes quiet. */
  private park(next: Waiting, now: number): void {
    this.parked = next;
    this.parkTimer ??= this.options.clock.setTimeout(() => this.unpark(), Math.max(0, this.focus.quietAt() - now));
  }

  private unpark(): void {
    this.parkTimer = undefined;
    const parked = this.parked;
    if (parked === undefined) return;
    const now = this.options.clock.now();
    // The followed agent spoke again meanwhile.
    if (now < this.focus.quietAt()) {
      this.parkTimer = this.options.clock.setTimeout(() => this.unpark(), this.focus.quietAt() - now);
      return;
    }
    this.parked = undefined;
    this.focus.admits(parked.key, now, true);
    this.offer(parked, now);
  }

  /** The work settled: the next row is followed whoever says it, and a row parked from the work that ended never shows. */
  private settled(next: ActivityDisplay): void {
    this.focus.release();
    if (this.parked?.display.activityId === next.activityId) this.parked = undefined;
  }

  /** Remembers the units shown, the newest few: a unit seen before is no new unit when the line comes back to it. */
  private rememberUnit(activityId: string): void {
    this.unitsShown.delete(activityId);
    this.unitsShown.add(activityId);
    if (this.unitsShown.size > UNITS_REMEMBERED) this.unitsShown.delete(this.unitsShown.values().next().value!);
  }

  private showPending(): void {
    this.timer = undefined;
    const next = this.pending;
    this.pending = undefined;
    if (next) this.show(next, this.options.clock.now());
  }

  private cancelPending(): void {
    if (this.timer !== undefined) this.options.clock.clearTimeout(this.timer);
    this.timer = undefined;
    this.pending = undefined;
  }

  private show(next: Waiting, now: number): void {
    const previous = this.shown;
    this.shown = next.display;
    this.shownDeciding = next.deciding;
    this.shownKey = next.key;
    this.rememberUnit(next.display.activityId);
    if (previous !== null && !visiblyDiffers(previous, next.display)) return;
    this.changedAt = now;
    if (previous === null || previous.headline !== next.display.headline) this.headlineSince = now;
    this.options.onChange(next.display);
  }
}

function displayFor(event: ClientGatewayActivity, previous: ActivityDisplay | null, reading: Reading, words: ActivityHostWords, because?: SupervisorEndingWords): ActivityDisplay {
  const { unit, retry, trial, preparation, recorded, counted } = reading;
  // A settling row names the work it ends, which outweighs the subject
  // (`ending-kind.ts`), and the unit keeps that name for every row after it:
  // a thought after a build's ending took the run's headline again, "Couldn't
  // fix your Flow | Build stopped: a budget ran out" (run-mux74k5q-1c3c2127).
  const settledAs = previous !== null && previous.activityId === event.activityId && isSettled(previous) ? previous.subjectKind : undefined;
  const subjectKind = endingKindOf(event) ?? settledAs ?? subjectKindOf(event);
  // A check only the person can answer holds the work until the page lets it
  // through; Core's own settling and waiting events still say what they say.
  const outcome = outcomeOf(event) ?? (unit.check ? "waiting" : null);
  const working = outcome === null;
  const headline = activityHeadline(subjectKind, outcome, words, {
    stopped: event.stopped === true,
    // A run pressing a failed step again is not a repair (D12), and nor is
    // anything a candidate trial's run, getting the page ready, or checking
    // against the recorded run reports.
    repairing: unit.repairing && retry.repairing && !trial.testing && !preparation.preparing && !recorded.checking,
    testing: trial.testing,
    checkingRecording: recorded.checking,
    preparing: preparation.preparing,
    resetting: unit.resetting,
    waitingOn: event.phase === "waiting_permission" ? "answer" : event.phase === "paused" ? "paused" : "check"
  });
  const sameUnit = previous !== null && previous.activityId === event.activityId;
  const said = sentenceFor(event, reading, because);
  // A part's own step is said by its action: its own numbering is not the run's.
  const sentence = said !== null && counted?.inner ? withoutRunNumbering(said) ?? (sameUnit ? previous.detail : null) : said;
  const detail = sentence === null ? null : activityWithoutHeadline(headline, bounded(activitySaidOnce(sentence), because !== undefined ? MAX_ENDING_DETAIL : MAX_DETAIL));
  // A run's step events carry the step; the events between them ("Run
  // started", a note) keep the step last said, so the count does not blink out
  // -- but not into a repair of the Flow itself, which is on no step of the
  // run (U2 of t194: "Step 5 of 5" for a four-minute re-author), not across
  // either end of a candidate trial, whose run counts its own steps, not from
  // another agent's line, and never while the page is got ready.
  const carried = sameUnit && reading.sameAgent && !unit.rebuilding && !trial.startedNow && !trial.endedNow ? previous.step : null;
  // A held run keeps the step it will continue from, so the chat can say it.
  const step = preparation.preparing ? null : working || event.phase === "paused" ? counted?.step ?? carried : null;
  return {
    activityId: event.activityId,
    subjectKind,
    // A trial's failed step reports Core's `repairing` phase; the trial is
    // still only running the Flow, so it is coloured as running.
    phase: (trial.testing || preparation.preparing || recorded.checking) && event.phase === "repairing" ? "running" : event.phase,
    headline,
    detail,
    step: step === null ? null : { index: step.index, count: step.count },
    working,
    outcome,
    sequence: event.sequence,
    kind: "action"
  };
}

/** What the line says of `event` before it is bounded: nothing for the person's own answer or a held run. */
function sentenceFor(event: ClientGatewayActivity, reading: Reading, because: SupervisorEndingWords | undefined): string | null {
  // The person's own answer is said in the thread (the ask and its card); as
  // the status it would be the third telling of one press (D7).
  if (personAnswered(event) || event.phase === "paused") return null;
  if (because !== undefined) {
    const sentence = because.sentence ?? statusSentence(event);
    return because.reason === undefined ? sentence : withReason(sentence, because.reason);
  }
  if (reading.unit.checkReportedNow) return CHECK_DETAIL;
  return reading.preparation.line ?? reading.recorded.line ?? reading.trial.line ?? reading.retry.line ?? statusSentence(event);
}

/**
 * The display for one of the model's thoughts, or a refusal (`kind`): the
 * unit's headline, working state and outcome from the event, and the detail,
 * phase and step of `base`, the action line it keeps -- or none, when the
 * event opens the unit. A run's retry line is FluxIQ's own status, not the
 * model's words: a recovery choice keeps it up, and the thought that ends the
 * retry takes it down.
 */
function quietDisplayFor(event: ClientGatewayActivity, base: ActivityDisplay | null | undefined, reading: Reading, words: ActivityHostWords, kind: "thought" | "action"): ActivityDisplay {
  const { unit, retry, trial, preparation } = reading;
  const kept = base && base.activityId === event.activityId ? base : null;
  const own = displayFor(event, kept, reading, words);
  const keptLine = kept && kept.detail !== retry.ended ? kept.detail : null;
  // A test's opening line is FluxIQ's own words too (`candidate-trial.ts`), said as the decision to test begins it.
  const line = retry.line ?? (trial.startedNow || trial.calledNow ? trial.line : null) ?? keptLine;
  return {
    ...own,
    phase: kept?.phase ?? own.phase,
    detail: line === null ? null : activityWithoutHeadline(own.headline, line),
    step: own.working && !preparation.preparing ? (kept && !unit.rebuilding ? kept.step : null) ?? own.step : null,
    kind
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

/** Either row of a check that cleared before anyone was asked, which Core tells after the fact. */
function isClearedWait(event: ClientGatewayActivity): boolean {
  return event.detail?.kind === "ask" && event.detail.title === CLEARED_WAIT_TITLE;
}

/** A part's step said by its action alone; null when it says nothing but its numbering. */
function withoutRunNumbering(sentence: string): string | null {
  const match = RUN_STEP.exec(sentence);
  if (!match) return sentence;
  const action = match[1]?.trim();
  return action ? `${action.charAt(0).toUpperCase()}${action.slice(1)}` : null;
}

function isSettled(display: ActivityDisplay): boolean {
  return display.outcome === "failed" || display.outcome === "done";
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

function stepOf(step: ClientGatewayActivity["step"]): { index: number; count: number } | null {
  if (!step || !Number.isFinite(step.index) || step.index < 1) return null;
  return { index: Math.floor(step.index), count: Number.isFinite(step.count) && step.count >= 0 ? Math.floor(step.count) : 0 };
}

/**
 * `text` with its whitespace collapsed, cut to `max` where a word ends. A
 * sentence Core already cut by count to its bound -- exactly that long, its
 * ellipsis in the last place -- may end inside a word, so its last word,
 * whole or not, gives way to the ellipsis.
 */
function bounded(text: string, max: number): string | null {
  const collapsed = text.replace(/\s+/gu, " ").trim();
  if (!collapsed) return null;
  const whole = collapsed.length === CORE_BOUND && collapsed.endsWith("…") && /\s/u.test(collapsed) ? `${collapsed.slice(0, -1).replace(/\s+\S*$/u, "").replace(/[\s,;:—–-]+$/u, "")}…` : collapsed;
  return cutAtWord(whole, max);
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
