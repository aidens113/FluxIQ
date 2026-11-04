// The chat's message list: every turn and every one of FluxIQ's step
// messages and answer turns, in time order. The live status is the work header
// above the composer (`../work-header/`), not an entry here. Reconciled, never
// rebuilt: each turn, step message and answer keep their element for as long
// as they exist, and move only when they are out of place (`placeChildren`),
// so nothing on screen flickers, loses focus or jumps while pushes and polls
// arrive. A step message and its action cards are updated in place as each
// action starts and ends.

import { createElement } from "../../dom/index.ts";
import { createAnswerView, type AnswerHost, type AnswerView } from "../answer/index.ts";
import type { AskControlsContext, CoreTurn } from "../conversation/index.ts";
import type { ChatStream } from "../stream/index.ts";
import type { ChatAttachmentPort, ChatTaskOutcome } from "../ports/index.ts";
import type { AttachmentPlace } from "./attachment-view.ts";
import { createMessageView, type MessageView } from "./message-view.ts";
import { placeChildren } from "./place-children.ts";
import { createStepMessageView, type StepMessageView } from "./step-message-view.ts";
import type { TurnMeta } from "./turn-meta.ts";

/** What a turn's controls are given, and what makes them change. `place` is where its attachment is read from. */
export type TurnControls = { ask: AskControlsContext; state: string; place?: AttachmentPlace | undefined };

/**
 * What a host adds to how the list draws its turns. `answers` is what the answer turns
 * need: the results port (exports, Run again, Add budget) and the host's callbacks.
 */
export type ThreadViewOptions = { attachments?: ChatAttachmentPort | undefined; meta?: TurnMeta | undefined; answers?: AnswerHost | undefined };

/** The mounted list. */
export type ThreadView = {
  readonly element: HTMLElement;
  /**
   * Shows `stream`. `working` is
   * the unit of work still under way or waiting on the person, if any, so only
   * its newest action says it is working, and only its cards Core has not yet
   * settled a wait for say waiting for you. Answers whether
   * anything shows.
   */
  render(stream: ChatStream, controls: (turn: CoreTurn) => TurnControls, working?: string | null): boolean;
  /** Forgets every turn and step message, for a thread that replaces this one. */
  clear(): void;
  /** The element of the turn `turnId`, once it has one: where a "Show me" scrolls to. */
  turnElement(turnId: string): HTMLElement | undefined;
};

/** Creates the list. */
export function createThreadView(options: ThreadViewOptions = {}): ThreadView {
  const element = createElement("ol", { className: "chat-stream", attrs: { "aria-label": "Conversation with FluxIQ", "aria-live": "polite" } }, []);
  const turns = new Map<string, MessageView>();
  const steps = new Map<string, StepMessageView>();
  const answers = new Map<string, AnswerView>();

  /** The answer turn's element, kept for as long as its attempt shows one; none while it has no answer. */
  function answerNode(key: string, outcome: ChatTaskOutcome): HTMLElement[] {
    let view = answers.get(key);
    if (view === undefined) {
      view = createAnswerView(options.answers);
      answers.set(key, view);
    }
    return view.update(outcome) ? [view.element] : [];
  }

  return {
    element,
    render(stream, controls, working = null) {
      const seen = new Set<string>();
      const nodes = stream.items.flatMap((item): HTMLElement[] => {
        seen.add(item.key);
        if (item.kind === "answer") return answerNode(item.key, item.outcome);
        if (item.kind === "step") {
          let view = steps.get(item.key);
          if (view === undefined) {
            view = createStepMessageView(options.meta);
            steps.set(item.key, view);
          }
          view.update(item.message, working !== null && item.message.activityId === working);
          return [view.element];
        }
        let view = turns.get(item.key);
        if (view === undefined) {
          view = createMessageView(item.turn.author, options);
          view.element.setAttribute("data-turn-id", item.turn.turnId);
          turns.set(item.key, view);
        }
        const given = controls(item.turn);
        view.update(item.turn, signature(item.turn, given.state), given.ask, given.place);
        return [view.element];
      });
      placeChildren(element, nodes);
      for (const key of [...turns.keys()]) if (!seen.has(key)) turns.delete(key);
      for (const key of [...steps.keys()]) if (!seen.has(key)) steps.delete(key);
      for (const key of [...answers.keys()]) if (!seen.has(key)) answers.delete(key);
      return nodes.length > 0;
    },
    clear() {
      turns.clear();
      steps.clear();
      answers.clear();
      placeChildren(element, []);
    },
    turnElement: (turnId) => turns.get(`turn:${turnId}`)?.element
  };
}

// A turn looks the same while what Core said in it, its question, the state
// of its answer, and why it could not be sent do; a re-read that parsed a new but equal object keeps it.
function signature(turn: CoreTurn, state: string): string {
  const carries = turn.attachment === undefined ? "" : `${turn.attachment.kind}:${turn.attachment.ref}`;
  return [turn.text, JSON.stringify(turn.ask), turn.sendError ?? "", carries, state].join("\u0000");
}
