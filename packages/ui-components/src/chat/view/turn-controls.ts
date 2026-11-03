// What each turn of the thread is given to act with: its question's answer
// controls, and where its attachment is read from. The chat window builds one
// of these around its owner, scope and controller, and every press is checked
// against the moment it was made for (`eligible`): a press for an older owner,
// an older set of controls, a thread no longer on screen or a question that has
// changed is refused.
//
// A host that words its questions (`ChatAskPort`) shows them through
// `present`. An action that needs the person's PIN asks the host's dialog
// (`reauthorize`); `submit` sends the answer with the PIN and answers whether it
// went. The PIN is a parameter of that one call: it is not stored here, put in a
// signature, or sent anywhere but the answer.

import { createElement } from "../../dom/index.ts";
import type { ConversationController, ConversationState, CoreTurn } from "../conversation/index.ts";
import type { ChatOwner } from "../owner-context.ts";
import type { ChatAskPort, ChatHostStatus, ChatOpenControl, ChatOpenControlFactory } from "../ports/index.ts";
import type { TurnControls } from "./thread-view.ts";

/** What the controls need from the chat window, each read at the moment of use. */
export type TurnControlsDeps = {
  owner(): ChatOwner;
  /** Changes whenever the window rebuilds its controls. */
  scope(): object;
  controller(): ConversationController;
  /** Whether the window may act at all now (it is active, or not yet told otherwise). */
  allowed(): boolean;
  status(): ChatHostStatus | undefined;
  /** Keeps an Open FluxIQ control the window must tell of the host's status, while its turn is on screen. */
  track(opener: ChatOpenControl): void;
  openControl?: ChatOpenControlFactory | undefined;
  asks?: ChatAskPort | undefined;
};

const STALE = "That question is not waiting for an answer here.";

/** The function that makes a turn's controls for the state it is drawn in. */
export function createTurnControls(deps: TurnControlsDeps): (turn: CoreTurn, state: ConversationState) => TurnControls {
  return (turn, state) => {
    const captured = deps.owner();
    const scope = deps.scope();
    const destination = deps.controller();
    const askSignature = JSON.stringify(turn.ask);
    const current = () => captured === deps.owner() && captured.current() && scope === deps.scope()
      && destination.state().conversationId === state.conversationId;
    const eligible = () => current() && deps.allowed()
      && destination.state().turns.some((candidate) => candidate.turnId === turn.turnId && candidate.text === turn.text && JSON.stringify(candidate.ask) === askSignature);
    const askId = turn.ask?.askId;
    const answering = askId !== undefined && state.answering.has(askId);
    const error = askId === undefined ? undefined : state.answerErrors.get(askId);
    const presented = turn.ask?.status === "pending" ? deps.asks?.present(turn.ask.record) ?? null : null;
    const asks = deps.asks;
    const projectId = state.projectId ?? deps.status()?.projectId;
    return {
      state: `${answering}|${error ?? ""}|${presented === null ? "" : JSON.stringify(presented)}`,
      place: state.conversationId === undefined || projectId === undefined
        ? undefined
        : { projectId, conversationId: state.conversationId, turnId: turn.turnId, current },
      ask: {
        answering,
        error,
        presented,
        reauthorize: asks?.reauthorize === undefined ? undefined : (action) => {
          if (!eligible() || askId === undefined || action.reauthorize === undefined) return;
          asks.reauthorize!({
            ...action.reauthorize,
            submit: async (pin) => (eligible()
              ? destination.answer(askId, action.kind, action.value, { authorizationPin: pin })
              : { ok: false, error: STALE }),
            cancel: () => undefined
          });
        },
        answer: (kind, value) => (eligible() && askId !== undefined ? destination.answer(askId, kind, value) : undefined),
        openFluxIQ: () => {
          if (!eligible() || deps.openControl === undefined) {
            return createElement("span");
          }
          const made: ChatOpenControl = deps.openControl({ label: "Open FluxIQ", look: "link", purpose: "ask", canOpen: () => eligible() && made.element.isConnected });
          const status = deps.status();
          if (status !== undefined) {
            made.observe(status);
          }
          deps.track(made);
          return made.element;
        }
      }
    };
  };
}
