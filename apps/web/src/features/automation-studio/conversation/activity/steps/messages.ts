// Core's activity events as FluxIQ's own messages in the chat, one per thing
// it decided, repaired or checked, each with its reason. Pure; no React.
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
//             does not explain its steps yet): the action itself, in words
//   ended     how a unit of work ended when it failed, if nothing else said so
//
// Not a message: a pure status change, a decision still being made
// ("Deciding the next step", no text: the live line says it), a build's start
// and finish markers, an ask (its turn carries the question), and Core's
// bookkeeping (`internal.ts`).
//
// An action (`tool`) that follows a decision is that decision's outcome, not a
// message: it sets the decision's quiet outcome line as it starts and ends. A
// decision carries one action; a second one is its own `action` message. A
// check or an action that started is updated in place when it ends. A run step
// Core never ends is over once anything later happens in its unit of work.
//
// Keys come from the event that opened a message (`activityId#sequence`), and
// its time never changes, so a message is placed once and keeps its element
// for as long as it is on screen. The rules match the extension's
// (`apps/extension/src/panel/chat/stream/step/messages.ts` in the
// web-automation repository).

import type { ConversationActivity, ConversationActivityDetail, ConversationActivityDetailStatus } from "../contracts";
import { conversationActivityHeadline, conversationActivityOutcome } from "../headline";
import { conversationActivitySentence, conversationActivityTextIsHuman } from "../wording";
import { conversationActivityIsInternal } from "./internal";

export type ConversationStepMessageKind = "decision" | "repair" | "check" | "step" | "action" | "ended";

/** How the action a message stands for went; `text` is Core's sentence about it, in words. */
export type ConversationStepOutcome = { status: ConversationActivityDetailStatus; text?: string };

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
  /** The action's outcome; null for a message that stands for no action. */
  outcome: ConversationStepOutcome | null;
  /** The time of the event that opened it, in ms. Never changes. */
  atMs: number;
  /** The last event folded into it. */
  sequence: number;
  /** True for the newest message of its unit of work. */
  latest: boolean;
};

type Unit = {
  /** The decision the next action belongs to, while it has none. */
  decision: number | undefined;
  /** Actions and checks that started and have not ended, by identity. */
  open: Map<string, number>;
  /** A run step Core started and will not end. */
  step: number | undefined;
  repairing: boolean;
};

/** A sentence that is only codes: "Result: web.inspect.succeeded", or "a.b, c.d". */
const ONLY_CODES = /^(?:result:\s*)?[a-z0-9-]*[._][a-z0-9_.-]+(?:\s*,\s*[a-z0-9-]*[._][a-z0-9_.-]+)*$/iu;

/** The messages for `events` (oldest first), at most `limit` of them, the newest. */
export function conversationStepMessages(events: readonly ConversationActivity[], limit = 1_000): ConversationStepMessage[] {
  const drafts: ConversationStepMessage[] = [];
  const units = new Map<string, Unit>();

  const add = (event: ConversationActivity, kind: ConversationStepMessageKind, title: string, text: string | undefined, outcome: ConversationStepOutcome | null): number => {
    drafts.push({
      key: `step:${event.activityId}#${event.sequence}`,
      activityId: event.activityId,
      kind,
      title,
      ...(text === undefined || text === title ? {} : { text }),
      outcome,
      atMs: event.atMs,
      sequence: event.sequence,
      latest: false
    });
    return drafts.length - 1;
  };

  for (const event of events) {
    let unit = units.get(event.activityId);
    if (!unit) {
      unit = { decision: undefined, open: new Map(), step: undefined, repairing: false };
      units.set(event.activityId, unit);
    }
    if (event.phase === "repairing") unit.repairing = true;
    if (unit.step !== undefined) {
      const over = drafts[unit.step]!;
      if (over.outcome?.status === "started") over.outcome = { status: "succeeded" };
      over.sequence = Math.max(over.sequence, event.sequence);
      unit.step = undefined;
    }
    const before = drafts.length;
    const detail = event.detail && !conversationActivityIsInternal(event.detail) ? event.detail : undefined;
    if (detail) place(event, detail, unit);
    if (drafts.length === before && conversationActivityOutcome(event) === "failed") {
      const title = conversationActivityHeadline(event.subject.kind, "failed", unit.repairing);
      add(event, "ended", title, humanText(event.label.split(" — ")[0]), null);
    }
  }

  function place(event: ConversationActivity, detail: ConversationActivityDetail, unit: Unit): void {
    const status = detail.status;
    if (detail.kind === "thought") {
      const reason = reasonText(detail.text);
      if (reason === undefined) return;
      unit.decision = add(event, event.phase === "repairing" ? "repair" : "decision", titleOf(event, detail), reason, null);
      return;
    }
    if (detail.kind === "tool" || detail.kind === "check") {
      const identity = `${detail.kind}|${detail.ref ?? detail.title}`;
      const owner = unit.open.get(identity);
      const outcome: ConversationStepOutcome = {
        status: status ?? "succeeded",
        ...(detail.kind === "tool" && humanText(detail.text) ? { text: humanText(detail.text)! } : {})
      };
      let placed: number;
      if (owner !== undefined) {
        const draft = drafts[owner]!;
        draft.outcome = outcome;
        draft.sequence = event.sequence;
        if (draft.kind === "check" || draft.kind === "action") {
          draft.title = actionTitle(event, detail);
          const verdict = detail.kind === "check" ? reasonText(detail.text) : undefined;
          if (verdict !== undefined && verdict !== draft.title) draft.text = verdict;
        }
        placed = owner;
      } else if (detail.kind === "tool" && unit.decision !== undefined) {
        placed = unit.decision;
        const draft = drafts[placed]!;
        draft.outcome = outcome;
        draft.sequence = event.sequence;
      } else {
        const text = detail.kind === "check" ? reasonText(detail.text) : undefined;
        placed = add(event, detail.kind === "tool" ? "action" : "check", actionTitle(event, detail), text, outcome);
      }
      unit.decision = undefined;
      if (status === "started") unit.open.set(identity, placed);
      else unit.open.delete(identity);
      return;
    }
    unit.decision = undefined;
    // A build's start and finish markers carry no run step; the live line and
    // the answer say those. An ask's question is its turn.
    if (detail.kind !== "step" || event.step === undefined) return;
    const label = event.step.label?.trim();
    const title = label && conversationActivityTextIsHuman(label) ? `Step ${event.step.index}: ${label}` : `Step ${event.step.index}`;
    const placed = add(event, "step", title, undefined, { status: status ?? "succeeded" });
    if (status === "started") unit.step = placed;
  }

  const kept = limit >= 1 ? drafts.slice(-Math.floor(limit)) : [];
  const newest = new Map<string, ConversationStepMessage>();
  for (const draft of kept) newest.set(draft.activityId, draft);
  return kept.map((message) => ({ ...message, latest: newest.get(message.activityId) === message }));
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
