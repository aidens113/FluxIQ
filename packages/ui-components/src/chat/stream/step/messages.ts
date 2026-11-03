// Core's activity events as FluxIQ's own messages in the chat, one per thing
// it decided, did or checked: its reason in words, and the actions it took as
// cards. No DOM.
//
// What becomes a message, in the order the events arrived:
//
//   decision  a `thought` with text: Core's model chose an action and said
//             why. "Clicking “Get a free quote”" with "The quote form is
//             behind this button, so I'm opening it."
//   repair    a `thought` while Core repairs the Flow: its diagnosis
//   check     a `check`: the result check, its card saying the verdict
//   step      a run's step ("Step 2 of 5: Open results"), its card saying
//             how it went, and a build's failure marker
//   recovery  a recovery Core reported on a run step (a step done around it,
//             a start further along, a route, another way): what happened
//             and why, and its card (`recovery-message.ts`); a step row with
//             no recovery on it and no step of its own (an older Core's
//             route) stays a step message with no card
//   ask       what Core asked the person: a card waiting on them
//   note      what Core noted, in words, and Core's own deciding row with
//             its sentence ("Asking the AI model again"), which is status
//   action    an action with no decision before it (a Core that does not
//             explain its steps yet): its card
//   project   a card of the project supervisor's work on a `note` row: its
//             plan, a brief, a builder's return, a validator's receipt
//             (`project-message.ts`)
//
// Not a message: a pure status change, a decision still being made
// ("Deciding the next step", no text: the live line says it), a build's
// start and finish markers (the live line and the answer say those), a note
// with no words, and Core's own bookkeeping (`isInternalStep`). A note with no
// words is a call Core made for itself -- the look before the first decision,
// the dry run putting the page back -- which the live line says while it
// runs; as a message it was a bare heading, twice, once as it started and
// once as it ended (live runs 34 and 35: "Looking at the page").
// What the person asked the work (`request`) is their message, not a step
// (`../stream-items.ts`).
//
// Every action is a card (`actionCard`): an icon for its kind, what it acted
// on, and how it went. The actions (`tool`) a decision led to are that
// decision's cards, in the order they happened, until something else opens a
// message. An action with no decision before it (a Core that does not explain
// its steps yet) is an `action` message that is only its card. A check, a
// question to the person (a robot check or a permission) and a run's step
// are each a message with its own card. A card that started is updated in
// place when it ends. A run step Core never ends is over once anything later
// happens in its unit of work: failed when that is the run's recovery from
// that step or the run failing, done otherwise. The row that opens that
// recovery settles the step with the failure's code, which becomes the card's
// reason ("the page was busy"); it is never a message of its own. A Merge's
// step ("Join paths") is no message: it does nothing a person could see.
//
// A card waiting on the person (a robot check, a permission) is over only
// when Core says so: the ask row that settles the wait carries the same ask
// id (`activityActionKey`: `ask:<ref>`) and a `resolution`, and the card is
// marked from it in place, the same element in the same place. Nothing later
// in the work settles it, so a wait Core never settles stays waiting. One
// check is one card: a tool whose result says the page needs a person (Core's
// reading is a robot check, waiting) and the robot-check ask of the same unit
// of work are joined, whichever came first, and the second updates the first
// card in place. An ask row that names no ask id while another ask's card is
// waiting only restates that wait (a parked run's "Run is waiting for an
// answer") and adds nothing. The rules match the Core panel's
// (`apps/web/.../conversation/activity/steps/messages.ts` in FluxIQ Core).
//
// A card that did nothing and repeats one shown since anything new happened
// is no new card: the card it repeats counts it (`card-repeats.ts`). A step
// that didn't work and then did when the run tried it again is one card that
// says on which try (`retried.ts`). Steps
// done again before a retry, already shown as done, are one card that holds
// them (`done-again.ts`).
//
// A build with several agents keeps each agent's decisions apart: what a
// unit of work remembers (the decision its next actions belong to, the run
// step still open, its asks) is kept per brief, `activityId#briefId`, so a
// builder's action is a card of that builder's own decision, never of the
// supervisor's or another builder's. Each message keeps its author, and names
// its lane where the lane changes (`withAgents`, `project-message.ts`).
//
// Keys come from the event that opened a message (`step:activityId#sequence`)
// or a card (`action:activityId#sequence`), so each keeps its element for as
// long as it is on screen and never moves. Every word comes from `stepWords`
// or Core's shared reading of the action, never a raw id.

import { activityActionKey, activityActionSkipped } from "fluxiq/ui";
import { activityAgent, isInternalStep, isModelThought, projectCard, stepRecovery, stepSkip, type ActivityAgent, type ClientGatewayActivity } from "fluxiq/ui";
import { actionCard, type ActionCard } from "./action-card.ts";
import { foldRepeatedCards } from "./card-repeats.ts";
import { foldRetriedCards } from "./retried.ts";
import { foldDoneAgain } from "./done-again.ts";
import { projectMessages, withAgents } from "./project-message.ts";
import type { ProjectWords } from "./project-words.ts";
import { recoveryMessage } from "./recovery-message.ts";
import { stepWords } from "./words.ts";

type ActivityDetail = NonNullable<ClientGatewayActivity["detail"]>;

/** What a message is. */
export type StepMessageKind = "decision" | "repair" | "check" | "step" | "recovery" | "ask" | "note" | "action" | "project";

/** One of FluxIQ's step messages. */
export type StepMessage = {
  /** `step:<activityId>#<sequence>` of the event that opened it: stable for its life. */
  key: string;
  /** The unit of work it belongs to (`ClientGatewayActivity.activityId`). */
  activityId: string;
  kind: StepMessageKind;
  /** What FluxIQ is doing, in words. */
  title: string;
  /** Why, or the verdict, in Core's words; undefined when there is none. */
  text: string | undefined;
  /** The actions it stands for or led to, as cards, in the order they happened; empty for none. */
  actions: ActionCard[];
  /** The time of the event that opened it, in ms. */
  at: number;
  /** The last event folded into it. */
  sequence: number;
  /** True for the newest message of its unit of work. */
  latest: boolean;
  /** Which of a build's agents it comes from; absent on a build with one agent. */
  agent?: ActivityAgent;
  /** Its agent's lane in words ("Builder · Search"), where the message before it in its unit was in another lane. */
  lane?: string;
  /** On a `project` message: the card of the supervisor's work, in words. */
  project?: ProjectWords;
};

/** Where a card lives: its message and its place among the message's cards. */
type Place = { message: number; card: number };

type Unit = {
  /** The decision the next actions belong to, until something else opens a message. */
  decision: number | undefined;
  /** Actions and checks that started and have not ended, by identity. */
  open: Map<string, Place>;
  /** A run step Core started and will not end. */
  step: number | undefined;
  /** The node that run step ran (its `detail.ref`), so the row that says it failed can be told from any later row. */
  stepNode: string | undefined;
  /** Each ask's card, by its ask id (`activityActionKey`), so the row that settles it finds it. */
  asks: Map<string, Place>;
  /** A robot-check card still waiting for its other half: the ask, or the tool that met the check. */
  check: { place: Place; from: "ask" | "tool" } | undefined;
  /** Each run step's label by its node, so a recovery for that node can name the step it was for. */
  labels: Map<string, string>;
};

/**
 * `next` with what `before` named and `next` does not: a kind of its own, the
 * act's name that goes with it, and a target. A call's end is said after the
 * page moved, and a name the start gave it is not lost ("Click · No thanks"
 * became "Click · the page", t193).
 */
function withEarlierNames(before: ActionCard, next: ActionCard): ActionCard {
  const card: ActionCard = { ...next, kind: next.kind === "other" ? before.kind : next.kind, target: next.target ?? before.target };
  const named = next.kind === "other" ? before.name : next.name;
  delete card.name;
  return named === undefined ? card : { ...card, name: named };
}

/** A robot check still waiting on the person: the only card the other half of a check joins. */
function waitsOnPerson(card: Pick<ActionCard, "kind" | "outcome">): boolean {
  return card.kind === "person_check" && card.outcome === "waiting";
}

/**
 * Whether `event`, the row after a run step Core started, says that step
 * failed: the run's recovery from a failed step names the node it recovers
 * (`ref`, `executor/graph-run.ts` in Core), and a run that fails ends on its
 * final `failed` row.
 */
function stepFailedBy(event: ClientGatewayActivity, node: string | undefined): boolean {
  if (event.phase === "failed") return true;
  return event.phase === "repairing" && node !== undefined && event.detail?.ref === node;
}

/**
 * Whether `event` is Core's row that settles a failed run step as its recovery
 * opens (`activity/step-recovering.ts` in Core): a `repairing` step row that
 * failed, names the node it ran (`ref`) and carries the failure's code in its
 * record, but opens no step of its own. It is the step's card's reason, never
 * a message: as one it was a bare "Recovery started" line (t174-w88 D5).
 */
function settlesStep(event: ClientGatewayActivity): boolean {
  const detail = event.detail;
  // A recovery that failed or was held back has the same shape, and is a message of its own.
  return event.phase === "repairing" && event.step === undefined && detail?.kind === "step" && detail.status === "failed" && detail.ref !== undefined && stepRecovery(event) === undefined;
}

/** Skips Core decides after it announced the step, which settle that step's card. */
const SKIPPED_AFTER_ANNOUNCING: ReadonlySet<string> = new Set(["optional_absent", "state_routed", "already_in_state"]);

/**
 * Core's words for `event` when it is the row that says the run step it
 * announced for `node` was skipped (`stepSkip`; Core's `activityActionSkipped`),
 * or null. A skip for already done comes in place of a step, not after one
 * (`already-done.ts`), and keeps its own card.
 */
function skippedStep(event: ClientGatewayActivity, node: string | undefined): string | null {
  const skip = stepSkip(event);
  if (skip === undefined || node === undefined || event.detail?.ref !== node || !SKIPPED_AFTER_ANNOUNCING.has(skip.reason)) return null;
  return activityActionSkipped(skip);
}

/** The messages for `events` (oldest first), at most `limit` of them, the newest. */
export function stepMessages(events: readonly ClientGatewayActivity[], limit: number): StepMessage[] {
  const drafts: StepMessage[] = [];
  const units = new Map<string, Unit>();
  const project = projectMessages();
  let lastAt = Number.NEGATIVE_INFINITY;

  const add = (event: ClientGatewayActivity, detail: ActivityDetail, kind: StepMessageKind, at: number, card: ActionCard | null): number => {
    const words = stepWords(detail, event.step);
    drafts.push({
      key: `step:${event.activityId}#${event.sequence}`,
      activityId: event.activityId,
      kind,
      title: words.title,
      text: words.text,
      actions: card === null ? [] : [card],
      at,
      sequence: event.sequence,
      latest: false
    });
    return drafts.length - 1;
  };
  const cardKey = (event: ClientGatewayActivity): string => `action:${event.activityId}#${event.sequence}`;
  const cardAt = (place: Place): ActionCard => drafts[place.message]!.actions[place.card]!;
  /** Marks the card at `place` from `next` in place: its key never changes, and a kind or a name it had is kept. */
  const mark = (place: Place, next: ActionCard, sequence: number): void => {
    const draft = drafts[place.message]!;
    const before = cardAt(place);
    draft.actions[place.card] = { ...withEarlierNames(before, next), key: before.key };
    draft.sequence = Math.max(draft.sequence, sequence);
  };
  /** The unit's robot-check card waiting for the other half named by `from`, while it still waits. */
  const joinable = (unit: Unit, from: "ask" | "tool"): Place | undefined => {
    const check = unit.check;
    return check?.from === from && waitsOnPerson(cardAt(check.place)) ? check.place : undefined;
  };

  for (const event of events) {
    const parsed = Date.parse(event.at);
    const at = Number.isFinite(parsed) ? parsed : lastAt;
    lastAt = at;
    // A brief that waits starts once its builder speaks (`project-message.ts`).
    project.seen(event);
    const briefId = activityAgent(event)?.briefId;
    const unitKey = briefId === undefined ? event.activityId : `${event.activityId}#${briefId}`;
    let unit = units.get(unitKey);
    if (unit === undefined) {
      unit = { decision: undefined, open: new Map(), step: undefined, stepNode: undefined, asks: new Map(), check: undefined, labels: new Map() };
      units.set(unitKey, unit);
    }
    const recovery = stepRecovery(event);
    // A recovery is done around a step, not its end: a step it ran before or
    // during is ended by the row after it, as it would be without it.
    if (unit.step !== undefined && recovery === undefined) {
      const over = drafts[unit.step]!;
      // Core never ends a run step, so the next row of its unit does -- and
      // says how. A recovery for that same node, or the run itself failing, is
      // the step failing: a press that did not work read "Done" just above
      // "Run failed" (U-A1, `run-muq6lqnw-fdfa7aac`). Anything else is the run
      // moving on past a step that worked.
      const outcome = stepFailedBy(event, unit.stepNode) ? "failed" : "done";
      // The row that settles it says why it failed, from the failure's code:
      // "Click · Get coupons" read "Didn't work" with no reason when the page
      // had said it was busy (D8, `run-murwd8le-79e735a8`).
      const why = outcome === "failed" && settlesStep(event) ? actionCard(event, "")?.why ?? null : null;
      // A step Core passed over once it was announced -- what it acts on was
      // not shown, or the page was already at another step -- is skipped, not
      // done: its card read "Done" while the status line said "Skipped ...: it
      // was not shown" (round 12, lane D, `run-mv62icw0-070f88ad`). Core's
      // words for the skip go on the step's card, and its row is no second card.
      const skipped = outcome === "done" ? skippedStep(event, unit.stepNode) : null;
      over.actions = over.actions.map((card) => (card.outcome === "working" ? { ...card, outcome, ...(why === null ? {} : { why }), ...(skipped === null ? {} : { tested: skipped }) } : card));
      over.sequence = Math.max(over.sequence, event.sequence);
      unit.step = undefined;
      unit.stepNode = undefined;
      if (skipped !== null) continue;
    }
    const detail = event.detail;
    if (detail === undefined || isInternalStep(detail) || settlesStep(event)) continue;
    const supervised = projectCard(event);
    if (supervised !== undefined) {
      unit.decision = undefined;
      drafts.push(project.message(event, supervised, at));
      continue;
    }
    if (recovery !== undefined) {
      unit.decision = undefined;
      const keys = { message: `step:${event.activityId}#${event.sequence}`, card: cardKey(event) };
      drafts.push(recoveryMessage(event, keys, at, recovery, detail.ref === undefined ? undefined : unit.labels.get(detail.ref)));
      continue;
    }
    const status = detail.status;
    const words = stepWords(detail, event.step);

    if (detail.kind === "thought") {
      if (words.text === undefined) continue;
      // Core's own deciding row with its sentence ("Asking the AI model again")
      // is status, not the model's reason: a note, and no decision the next
      // actions belong to (`isModelThought`, t378 W4).
      if (!isModelThought(event)) {
        unit.decision = undefined;
        add(event, detail, "note", at, null);
        continue;
      }
      unit.decision = add(event, detail, event.phase === "repairing" ? "repair" : "decision", at, null);
      continue;
    }

    if (detail.kind === "tool" || detail.kind === "check") {
      const identity = activityActionKey(event) ?? `${detail.kind}:${detail.title}`;
      const owner = unit.open.get(identity);
      const met = detail.kind === "tool" ? actionCard(event, cardKey(event)) : null;
      const asked = met !== null && waitsOnPerson(met) ? joinable(unit, "ask") : undefined;
      if (met !== null && asked !== undefined) {
        // The check the ask already waits on: its card, not a second one. The
        // ask says how it ends, so the card keeps what the ask said.
        const ask = cardAt(asked);
        mark(asked, { ...ask, target: ask.target ?? met.target }, event.sequence);
        unit.check = undefined;
        unit.open.delete(identity);
        unit.decision = undefined;
        continue;
      }
      let placed: Place;
      if (owner !== undefined) {
        const draft: StepMessage = drafts[owner.message]!;
        const before = draft.actions[owner.card];
        const card = actionCard(event, before?.key ?? cardKey(event));
        // The end keeps what the start named: a call's end is said after the
        // page moved, and a name the start gave it is not lost
        // ("Click · No thanks" became "Click · the page", t193).
        if (card !== null && before !== undefined) draft.actions[owner.card] = withEarlierNames(before, card);
        draft.sequence = event.sequence;
        if (draft.kind !== "decision" && draft.kind !== "repair") {
          draft.title = words.title;
          if (draft.kind === "check") draft.text = words.text ?? draft.text;
        }
        placed = owner;
      } else {
        const card = actionCard(event, cardKey(event));
        if (detail.kind === "tool" && unit.decision !== undefined && card !== null) {
          const draft = drafts[unit.decision]!;
          draft.actions.push(card);
          draft.sequence = event.sequence;
          placed = { message: unit.decision, card: draft.actions.length - 1 };
        } else {
          placed = { message: add(event, detail, detail.kind === "tool" ? "action" : "check", at, card), card: 0 };
        }
      }
      if (detail.kind === "check") unit.decision = undefined;
      if (status === "started") unit.open.set(identity, placed);
      else unit.open.delete(identity);
      if (met !== null && waitsOnPerson(met)) unit.check = { place: placed, from: "tool" };
      continue;
    }

    if (detail.kind === "ask") {
      const card = actionCard(event, cardKey(event));
      const key = activityActionKey(event);
      const known = key === null ? undefined : unit.asks.get(key);
      if (known !== undefined) {
        // The row that settles the wait, or one that says it again: the same card.
        if (card !== null) mark(known, card, event.sequence);
        if (unit.check?.place === known && !waitsOnPerson(cardAt(known))) unit.check = undefined;
        continue;
      }
      if (key === null && [...unit.asks.values()].some((place) => cardAt(place).outcome === "waiting")) continue;
      const reasoning = unit.decision;
      unit.decision = undefined;
      if (card === null) {
        add(event, detail, "ask", at, null);
        continue;
      }
      const tool = card.kind === "person_check" ? joinable(unit, "tool") : undefined;
      let placed: Place;
      if (tool !== undefined) {
        // The tool already met this check: the ask takes over its card.
        mark(tool, card, event.sequence);
        placed = tool;
        unit.check = undefined;
      } else if (reasoning !== undefined) {
        // Like an action, the ask is a card under the reasoning that led to
        // it, as the Core panel shows it; a message of its own only when no
        // reasoning came before it in this unit.
        const draft = drafts[reasoning]!;
        draft.actions.push(card);
        draft.sequence = event.sequence;
        placed = { message: reasoning, card: draft.actions.length - 1 };
        if (waitsOnPerson(card)) unit.check = { place: placed, from: "ask" };
      } else {
        placed = { message: add(event, detail, "ask", at, card), card: 0 };
        if (waitsOnPerson(card)) unit.check = { place: placed, from: "ask" };
      }
      if (key !== null) unit.asks.set(key, placed);
      continue;
    }

    unit.decision = undefined;
    if (detail.kind === "step") {
      const marker = event.step === undefined;
      // A build's start and finish say nothing the live line and the answer do
      // not. Nor does a failed finish when the build was started from a chat:
      // the chat's command writes how the build ended, and how far it got, into
      // that thread as its answer, so the marker said the same ending twice
      // (U-B2, in every chat-driven Lab run). A build started anywhere else has
      // no answer in a thread, and its failure is said here.
      if (marker && event.subject.kind === "build" && (status !== "failed" || event.conversationId !== undefined)) continue;
      const card = marker ? null : actionCard(event, cardKey(event));
      // A Merge joins the Flow's paths and does nothing a person could see: a
      // "Join paths" card was a step that was not one (U-A2). Core no longer
      // announces it (t174-w88); one that still does is not shown either.
      if (card?.kind === "join") continue;
      const placed = add(event, detail, "step", at, card);
      const label = event.step?.label?.trim();
      if (!marker && detail.ref !== undefined && label) unit.labels.set(detail.ref, label);
      if (!marker && status === "started") {
        unit.step = placed;
        unit.stepNode = detail.ref;
      }
      continue;
    }
    if (detail.kind === "note" && words.text === undefined) continue;
    add(event, detail, detail.kind, at, null);
  }

  // Repeated refusals and failures are one card each that counts them (U-8, R2-U-7, `card-repeats.ts`),
  // a step that worked when tried again is one card that says on which try (lane D finding 2,
  // `retried.ts`), and steps done again before a retry are one line that holds them (D7, `done-again.ts`).
  const folded = foldDoneAgain(foldRetriedCards(foldRepeatedCards(drafts)));
  const kept = limit > 0 ? folded.slice(-limit) : [];
  const newest = new Map<string, StepMessage>();
  for (const draft of kept) newest.set(draft.activityId, draft);
  return withAgents(kept.map((message) => ({ ...message, actions: [...message.actions], latest: newest.get(message.activityId) === message })), events);
}
