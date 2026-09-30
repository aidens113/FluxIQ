// Core's activity events as FluxIQ's own messages in the chat, one per thing
// it decided, repaired or checked, each with its reason and the actions it led
// to as cards. Pure; no React.
//
// What becomes a message, in the order the events arrived:
//
//   decision  a `thought` with text: Core's model chose an action and said
//             why. "Clicking “Get a free quote”" with "The quote form is
//             behind this button, so I'm opening it."
//   repair    a `thought` while Core repairs the Flow: its diagnosis or plan
//   check     a `check`: the result check and its verdict
//   step      a run's step ("Step 2: Open the listing")
//   action    an action with no decision before it (a run, or a Core that
//             does not explain its steps yet), or an ask with no decision
//             before it: the action itself, as its card
//   ended     how a unit of work ended when it failed, if nothing else said so
//
// Not a message: a pure status change, a decision still being made
// ("Deciding the next step", no text: the live line says it), a build's start
// and finish markers, and Core's bookkeeping (`internal.ts`).
//
// Every action is a card (`ConversationStepAction`): its kind, what it acted
// on and where it stands, read by Core's shared classifier (`activityActionOf`
// in `fluxiq/ui`), so this chat and the extension's draw the same card. An
// action (`tool`) or an ask that follows a decision is that decision's card,
// not a message of its own. A decision carries one action; a second one is its
// own `action` message. A check, a run step and a standalone action carry their
// own card. A card that started is updated in place when it ends. A run step
// Core never ends is over once anything later happens in its unit of work, and
// a card waiting on the person (a permission ask, a robot check) is over once
// the work leaves the wait.
//
// Keys come from the event that opened a message or a card
// (`activityId#sequence`), and that time never changes, so a message is placed
// once, and it and its cards keep their elements for as long as they are on
// screen. The rules match the extension's
// (`apps/extension/src/panel/chat/stream/step/messages.ts` in the
// web-automation repository).

import { activityActionOf, type ActivityAction } from "fluxiq/ui";
import type { ConversationActivity, ConversationActivityDetail } from "../contracts";
import { conversationActivityHeadline, conversationActivityOutcome } from "../headline";
import { conversationActivitySentence, conversationActivityTextIsHuman } from "../wording";
import { conversationActivityIsInternal } from "./internal";

export type ConversationStepMessageKind = "decision" | "repair" | "check" | "step" | "action" | "ended";

/** One action FluxIQ took, ready for its card. */
export type ConversationStepAction = ActivityAction & {
  /** `action:<activityId>#<sequence>` of the event that opened it: stable while it starts and ends. */
  key: string;
  /** Core's own sentence about how it went, when it is in words. */
  said?: string;
};

export type ConversationStepMessage = {
  /** `step:<activityId>#<sequence>` of the event that opened it: stable for its life. */
  key: string;
  /** The unit of work it belongs to. */
  activityId: string;
  kind: ConversationStepMessageKind;
  /** What FluxIQ is doing, in words. */
  title: string;
  /** Why, or the verdict, in Core's words; absent when there is none. */
  text?: string;
  /** The actions it led to, as cards, in the order they started; empty for none. */
  actions: ConversationStepAction[];
  /** The time of the event that opened it, in ms. Never changes. */
  atMs: number;
  /** The last event folded into it. */
  sequence: number;
  /** True for the newest message of its unit of work. */
  latest: boolean;
};

/** Where a card sits: its message, and its place among that message's cards. */
type Slot = { message: number; action: number };

type Unit = {
  /** The decision the next action belongs to, while it has none. */
  decision: number | undefined;
  /** Actions and checks that started and have not ended, by identity. */
  open: Map<string, Slot>;
  /** A run step Core started and will not end. */
  step: Slot | undefined;
  /** Cards waiting on the person. */
  waiting: Slot[];
  repairing: boolean;
};

/** A sentence that is only codes: "Result: web.inspect.succeeded", or "a.b, c.d". */
const ONLY_CODES = /^(?:result:\s*)?[a-z0-9-]*[._][a-z0-9_.-]+(?:\s*,\s*[a-z0-9-]*[._][a-z0-9_.-]+)*$/iu;

/** The messages for `events` (oldest first), at most `limit` of them, the newest. */
export function conversationStepMessages(events: readonly ConversationActivity[], limit = 1_000): ConversationStepMessage[] {
  const drafts: ConversationStepMessage[] = [];
  const units = new Map<string, Unit>();

  const add = (event: ConversationActivity, kind: ConversationStepMessageKind, title: string, text: string | undefined): number => {
    drafts.push({
      key: `step:${event.activityId}#${event.sequence}`,
      activityId: event.activityId,
      kind,
      title,
      ...(text === undefined || text === title ? {} : { text }),
      actions: [],
      atMs: event.atMs,
      sequence: event.sequence,
      latest: false
    });
    return drafts.length - 1;
  };

  /** Adds `action` as the newest card of message `index`. */
  const attach = (index: number, action: ConversationStepAction, sequence: number): Slot => {
    const draft = drafts[index]!;
    draft.actions.push(action);
    draft.sequence = Math.max(draft.sequence, sequence);
    return { message: index, action: draft.actions.length - 1 };
  };

  /** Replaces the card at `slot` in place: its key never changes, and a name it had is kept. */
  const update = (slot: Slot, next: ActivityAction & { said?: string }, sequence: number): void => {
    const draft = drafts[slot.message]!;
    const card = draft.actions[slot.action]!;
    draft.actions[slot.action] = {
      key: card.key,
      kind: next.kind === "other" ? card.kind : next.kind,
      target: next.target ?? card.target,
      outcome: next.outcome,
      why: next.why,
      ...(next.said === undefined ? {} : { said: next.said })
    };
    draft.sequence = Math.max(draft.sequence, sequence);
  };

  for (const event of events) {
    let unit = units.get(event.activityId);
    if (!unit) {
      unit = { decision: undefined, open: new Map(), step: undefined, waiting: [], repairing: false };
      units.set(event.activityId, unit);
    }
    if (event.phase === "repairing") unit.repairing = true;
    if (unit.step !== undefined) {
      const card = drafts[unit.step.message]!.actions[unit.step.action]!;
      if (card.outcome === "working") update(unit.step, { ...card, outcome: "done" }, event.sequence);
      unit.step = undefined;
    }
    // The person answered, or the work went on without them.
    if (unit.waiting.length && event.phase !== "waiting_permission") {
      const outcome = conversationActivityOutcome(event) === "failed" ? "failed" : "done";
      for (const slot of unit.waiting) {
        const card = drafts[slot.message]!.actions[slot.action]!;
        if (card.outcome === "waiting") update(slot, { ...card, outcome, why: null }, event.sequence);
      }
      unit.waiting = [];
    }
    const before = drafts.length;
    const detail = event.detail && !conversationActivityIsInternal(event.detail) ? event.detail : undefined;
    if (detail) place(event, detail, unit);
    if (drafts.length === before && conversationActivityOutcome(event) === "failed") {
      const title = conversationActivityHeadline(event.subject.kind, "failed", unit.repairing);
      add(event, "ended", title, humanText(event.label.split(" — ")[0]));
    }
  }

  function place(event: ConversationActivity, detail: ConversationActivityDetail, unit: Unit): void {
    const status = detail.status;
    if (detail.kind === "thought") {
      const reason = reasonText(detail.text);
      if (reason === undefined) return;
      unit.decision = add(event, event.phase === "repairing" ? "repair" : "decision", titleOf(event, detail), reason);
      return;
    }
    const action = cardOf(event, detail);
    let slot: Slot;
    if (detail.kind === "tool" || detail.kind === "check") {
      const identity = `${detail.kind}|${detail.ref ?? detail.title}`;
      const owner = unit.open.get(identity);
      if (owner !== undefined) {
        update(owner, action, event.sequence);
        const draft = drafts[owner.message]!;
        if (draft.kind === "check" || draft.kind === "action") {
          draft.title = actionTitle(event, detail);
          const verdict = detail.kind === "check" ? reasonText(detail.text) : undefined;
          if (verdict !== undefined && verdict !== draft.title) draft.text = verdict;
        }
        slot = owner;
      } else if (detail.kind === "tool" && unit.decision !== undefined) {
        slot = attach(unit.decision, action, event.sequence);
      } else {
        const text = detail.kind === "check" ? reasonText(detail.text) : undefined;
        slot = attach(add(event, detail.kind === "tool" ? "action" : "check", actionTitle(event, detail), text), action, event.sequence);
      }
      unit.decision = undefined;
      if (status === "started") unit.open.set(identity, slot);
      else unit.open.delete(identity);
    } else if (detail.kind === "ask") {
      // Its question is its turn; the card says the work is waiting on it.
      slot = unit.decision !== undefined
        ? attach(unit.decision, action, event.sequence)
        : attach(add(event, "action", titleOf(event, detail), undefined), action, event.sequence);
      unit.decision = undefined;
    } else {
      unit.decision = undefined;
      // A build's start and finish markers carry no run step; the live line and
      // the answer say those.
      if (detail.kind !== "step" || event.step === undefined) return;
      const label = event.step.label?.trim();
      const title = label && conversationActivityTextIsHuman(label) ? `Step ${event.step.index}: ${label}` : `Step ${event.step.index}`;
      slot = attach(add(event, "step", title, undefined), action, event.sequence);
      if (status === "started") unit.step = slot;
    }
    const placed = drafts[slot.message]!.actions[slot.action]!;
    const held = unit.waiting.some((entry) => entry.message === slot.message && entry.action === slot.action);
    if (placed.outcome === "waiting" && !held) unit.waiting.push(slot);
  }

  const kept = limit >= 1 ? drafts.slice(-Math.floor(limit)) : [];
  const newest = new Map<string, ConversationStepMessage>();
  for (const draft of kept) newest.set(draft.activityId, draft);
  return kept.map((message) => ({ ...message, latest: newest.get(message.activityId) === message }));
}

/**
 * The card for the action `detail` stands for, read by Core's shared
 * classifier. An action Core gave no status is taken as done, as the rest of
 * the chat reads it; an ask waits on the person until the work leaves the
 * wait. A name that is not in words is left out, and the card says "the page".
 */
function cardOf(event: ConversationActivity, detail: ConversationActivityDetail): ConversationStepAction {
  const status = detail.status ?? (detail.kind === "ask" ? undefined : "succeeded");
  const read = activityActionOf({ ...event, detail: { ...detail, ...(status === undefined ? {} : { status }) } });
  const fallback = status === "failed" ? "failed" : status === "started" ? "working" : "done";
  const action: ActivityAction = read ?? { kind: "other", target: null, outcome: fallback, why: null };
  const outcome = detail.kind === "ask" && action.outcome !== "failed" ? "waiting" : action.outcome;
  const said = detail.kind === "tool" ? humanText(detail.text) : undefined;
  return {
    key: `action:${event.activityId}#${event.sequence}`,
    kind: action.kind,
    target: humanText(action.target ?? undefined) ?? null,
    outcome,
    why: action.why,
    ...(said === undefined ? {} : { said })
  };
}

/** A decision's or an action's title: Core's title when it is in words, else its sentence. */
function titleOf(event: ConversationActivity, detail: ConversationActivityDetail): string {
  const title = detail.title.trim();
  return conversationActivityTextIsHuman(title) ? title : conversationActivitySentence(event);
}

/**
 * A check reads as Core's sentence about it ("The result doesn't answer the
 * request"), which says more than its title ("Result check"); an action reads
 * as its title, since a run's sentence is its status ("Running step 2 of 5").
 */
function actionTitle(event: ConversationActivity, detail: ConversationActivityDetail): string {
  return detail.kind === "check" ? conversationActivitySentence(event) : titleOf(event, detail);
}

/** The model's reason or a verdict, as Core bounded and screened it; nothing when it is only codes. */
function reasonText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || ONLY_CODES.test(trimmed)) return undefined;
  return trimmed;
}

/** Core's sentence about an action, only when it names no id and no code. */
function humanText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && conversationActivityTextIsHuman(trimmed) ? trimmed : undefined;
}
