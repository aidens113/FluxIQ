// One of FluxIQ's step messages, the way it reads in the chat: on FluxIQ's
// side of the conversation, what it decided in bold and why after a dash,
// then each action that led to as a card (`action-card-view.ts`), and steps
// done again before a retry as one line that opens to show them
// (`done-again-view.ts`).
//
//   **Clicking “Get a free quote”** — The quote form is behind this button,
//   so I'm opening it.
//   [( icon ) Click · Get a free quote / Done]
//
// A message that is an action itself (an action with no reason before it, a
// check, a question to the person, a run's step) is only its card; a note,
// or anything with no card, is only its words.
//
// A note, or a step's marker with no card (a build's ending), is a message of
// its own: its title on one line and its words under it as paragraphs
// (`chat-step-body`), never joined by a dash. The build's ending read as a
// bold title, " — " and one dense paragraph (round 5). A decision's reason
// stays after its title: the two are one thought. A recovery on a run step is
// both: what happened and why, then its card.
//
// While the unit of work is under way or waiting, its newest card says
// "Working on it" or "Waiting for you", and so does any card still waiting on
// the person: only Core's row that settles a wait ends it, so a note or a
// step after the question does not quiet it.
//
// A build with several agents (automation-project-agents-plan, chat
// presentation): a card of the project supervisor's work (its plan, a brief,
// a builder's return, a validator's receipt) is its heading and one card, the
// card drawn as an action card is -- the icon Core pins for the kind it
// stands for, its name and subflow, how it went -- with a plan's parts and
// subflows listed under it. A step from an agent working on a brief sits
// under that brief, indented (`data-brief`, `chat.css`), and a message whose
// lane is not the one before it names it first ("Builder · Search").
//
// The element lives as long as the message, and each card's element as long
// as its card: a render changes only the words and marks that changed, and
// adds a new card after the others, so nothing remounts, reorders or flickers
// while actions start and end. Text goes in through `textContent` only.

import { ACTIVITY_ACTION_ICONS } from "fluxiq/ui";
import { createElement } from "../../dom/index.ts";
import { lucideIcon } from "../../icons/index.ts";
import { parseAssistantText, renderTextBlocks } from "../format/index.ts";
import type { StepMessage } from "../stream/index.ts";
import type { ProjectCardWords } from "../stream/step/index.ts";
import { createActionCardView, type ActionCardView } from "./action-card-view.ts";
import { createDoneAgainView, type DoneAgainView } from "./done-again-view.ts";
import { placeChildren } from "./place-children.ts";

/** The mounted message. */
export type StepMessageView = {
  readonly element: HTMLElement;
  /** Shows `message`; `current` is true while its unit of work is under way or waiting on the person. */
  update(message: StepMessage, current: boolean): void;
};

/** Messages whose words are shown beside their cards: the reasoning, not the act. */
const SPOKEN: ReadonlySet<StepMessage["kind"]> = new Set<StepMessage["kind"]>(["decision", "repair", "recovery", "note"]);

/** Creates an empty message. */
export function createStepMessageView(): StepMessageView {
  const title = createElement("strong", { className: "chat-step-title" });
  const text = createElement("span", { className: "chat-step-text" });
  const line = createElement("p", { className: "chat-step-line" }, [title, text]);
  const body = createElement("div", { className: "chat-step-body", hidden: true });
  const cards = createElement("div", { className: "chat-cards", hidden: true });
  const lane = createElement("p", { className: "chat-step-lane", hidden: true });
  const element = createElement("li", { className: "chat-entry chat-step-msg" }, [lane, line, body, cards]);
  let bodyText = "";
  // Made only for a project message, which every other message never needs.
  let project: ProjectCardView | undefined;
  const views = new Map<string, ActionCardView>();
  const groups = new Map<string, DoneAgainView>();

  return {
    element,
    update(message, current) {
      setAttr(element, "data-kind", message.kind);
      setAttr(element, "data-role", message.agent?.role ?? null);
      // A step of an agent working on a brief sits under that brief; the brief itself is the header.
      setAttr(element, "data-brief", message.agent?.briefId !== undefined && message.kind !== "project" ? "true" : null);
      setText(lane, message.lane ?? "");
      if (lane.hidden !== (message.lane === undefined)) lane.hidden = message.lane === undefined;
      if (message.project !== undefined && project === undefined) {
        project = createProjectCardView();
        element.insertBefore(project.element, cards);
      }
      project?.update(message.project?.card, current);
      const spoken = SPOKEN.has(message.kind) || message.actions.length === 0;
      if (line.hidden === spoken) line.hidden = !spoken;
      setText(title, message.title);
      const words = message.text !== undefined && message.text.trim() !== "" && message.text !== message.title ? message.text : "";
      const ownMessage = message.actions.length === 0 && (message.kind === "note" || message.kind === "step");
      const paragraphs = ownMessage ? words : "";
      const reason = words !== "" && paragraphs === "" ? ` — ${words}` : "";
      setText(text, reason);
      if (text.hidden !== (reason === "")) text.hidden = reason === "";
      if (paragraphs !== bodyText) {
        bodyText = paragraphs;
        body.replaceChildren(...renderTextBlocks(parseAssistantText(paragraphs)));
      }
      const noBody = !spoken || paragraphs === "";
      if (body.hidden !== noBody) body.hidden = noBody;

      const last = message.actions.length - 1;
      const shown = message.actions.map((card, index) => {
        if (card.again !== undefined) {
          // Steps done again are one line that opens to show them (`done-again-view.ts`, D7).
          let group = groups.get(card.key);
          if (group === undefined) {
            group = createDoneAgainView();
            groups.set(card.key, group);
          }
          group.update(card);
          return group.element;
        }
        let view = views.get(card.key);
        if (view === undefined) {
          view = createActionCardView();
          views.set(card.key, view);
        }
        // A card waiting on the person waits until Core settles it, wherever it
        // sits; any other card is the action of the moment only as the newest.
        view.update(card, current && (card.outcome === "waiting" || (message.latest && index === last)));
        return view.element;
      });
      const keys = new Set(message.actions.filter((card) => card.again === undefined).map((card) => card.key));
      for (const key of [...views.keys()]) if (!keys.has(key)) views.delete(key);
      const grouped = new Set(message.actions.filter((card) => card.again !== undefined).map((card) => card.key));
      for (const key of [...groups.keys()]) if (!grouped.has(key)) groups.delete(key);
      placeChildren(cards, shown);
      if (cards.hidden !== (shown.length === 0)) cards.hidden = shown.length === 0;
    }
  };
}

/** The card of a project message, mounted once and updated in place. */
type ProjectCardView = { readonly element: HTMLElement; update(card: ProjectCardWords | undefined, current: boolean): void };

function createProjectCardView(): ProjectCardView {
  const mark = createElement("span", { className: "chat-card-mark", attrs: { "aria-hidden": "true" } });
  const name = createElement("span", { className: "chat-card-name" });
  const target = createElement("span", { className: "chat-card-target" });
  const head = createElement("span", { className: "chat-card-head" }, [name, target]);
  const outcome = createElement("span", { className: "chat-card-outcome" });
  const body = createElement("span", { className: "chat-card-body" }, [head, outcome]);
  const card = createElement("div", { className: "chat-card chat-project-card", attrs: { role: "group" } }, [mark, body]);
  const rows = createElement("div", { className: "chat-project-rows", hidden: true });
  const element = createElement("div", { className: "chat-cards chat-project", hidden: true }, [card, rows]);
  let icon = "";
  let listed = "";
  return {
    element,
    update(words, current) {
      if (element.hidden !== (words === undefined)) element.hidden = words === undefined;
      if (words === undefined) return;
      const named = ACTIVITY_ACTION_ICONS[words.icon] ?? ACTIVITY_ACTION_ICONS.other;
      if (named !== icon) {
        icon = named;
        mark.textContent = "";
        mark.append(lucideIcon(named));
      }
      // A brief works only while its build does: once the work stops without a return, it is settled.
      const state = words.state === "working" && !current ? "settled" : words.state;
      setAttr(card, "data-kind", words.icon);
      setAttr(card, "data-state", state);
      setAttr(card, "aria-label", [words.target === null ? words.name : `${words.name}, ${words.target}`, words.outcome].filter((part) => part !== null).join(": "));
      setText(name, words.name);
      setText(target, words.target ?? "");
      if (target.hidden !== (words.target === null)) target.hidden = words.target === null;
      setText(outcome, words.outcome ?? "");
      if (outcome.hidden !== (words.outcome === null)) outcome.hidden = words.outcome === null;
      // The rows of a plan never change once sent: rebuilt only when their words do.
      const signature = JSON.stringify(words.rows);
      if (signature !== listed) {
        listed = signature;
        rows.textContent = "";
        for (const group of words.rows) {
          const items = group.items.map((item) => createElement("li", { className: "chat-project-item", text: item }));
          rows.append(createElement("p", { className: "chat-project-heading", text: group.heading }), createElement("ul", { className: "chat-project-list" }, items));
        }
        rows.hidden = words.rows.length === 0;
      }
    }
  };
}

function setText(node: HTMLElement, value: string): void {
  if (node.textContent !== value) node.textContent = value;
}

function setAttr(node: HTMLElement, name: string, value: string | null): void {
  if (value === null) {
    if (node.getAttribute(name) !== null) node.removeAttribute(name);
    return;
  }
  if (node.getAttribute(name) !== value) node.setAttribute(name, value);
}
