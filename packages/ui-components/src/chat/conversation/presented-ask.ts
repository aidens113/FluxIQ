// A pending question in the host's words (`ChatAskPort.present`): its title
// when it has one (the turn's own words are often the whole question), the lead
// line, what an answer would commit as a list, a quiet note, then one button per
// action (by tone, the option's description on hover) or, for an open question,
// a text box with Send answer, where Enter sends as it does in the composer.
//
// An action that needs the person's PIN first (`reauthorize`) does not answer
// when pressed; it asks the host for its dialog (`context.reauthorize`). With
// no such dialog the chat cannot take that answer, so those actions give way to
// the "elsewhere" sentence and the Open FluxIQ control; the other actions, a
// refusal for one, stay.
//
// Answers require a person's activation: every press or key here acts only
// when it is a person's own (`isPersonEvent`).

import { createElement } from "../../dom/index.ts";
import type { ChatAskAction, ChatAskPresentation } from "../ports/index.ts";
import type { AskControlsContext } from "./ask-controls.ts";
import { composerKeyAction } from "./composer-keys.ts";
import { isPersonEvent } from "./person-event.ts";

/** Said where the chat cannot take an answer itself (the same words as `ask-copy.ts`). */
const ELSEWHERE = "Answer this in FluxIQ.";

/** The parts of `presented`, in the order they read. */
export function presentedAskControls(presented: ChatAskPresentation, context: AskControlsContext): HTMLElement[] {
  const parts: HTMLElement[] = [];
  if (presented.title !== "") parts.push(createElement("p", { className: "turn-ask-title", text: presented.title }));
  if (presented.description !== "") parts.push(createElement("p", { className: "turn-ask-lead", text: presented.description }));
  if (presented.consequences.length > 0) {
    parts.push(createElement("ul", { className: "turn-ask-consequences", attrs: { "aria-label": "Consequences requiring approval" } },
      presented.consequences.map((phrase) => createElement("li", { text: phrase }))));
  }
  if (presented.note !== undefined && presented.note !== "") parts.push(createElement("p", { className: "turn-note", text: presented.note }));
  if (presented.takesText) {
    parts.push(textAnswer(presented, context));
    return parts;
  }
  const askable = presented.actions.filter((action) => action.reauthorize === undefined || context.reauthorize !== undefined);
  // Where to answer reads straight after the note that says why, with the answers that can be given here under it.
  if (askable.length < presented.actions.length) parts.push(createElement("p", { className: "turn-note", text: ELSEWHERE }), context.openFluxIQ());
  parts.push(createElement("div", { className: "card-actions" }, askable.map((action) => actionButton(action, context))));
  return parts;
}

function actionButton(action: ChatAskAction, context: AskControlsContext): HTMLElement {
  const button = createElement("button", {
    className: "small-button",
    text: action.label,
    attrs: { type: "button", "data-tone": action.tone, ...(action.description ? { title: action.description } : {}) }
  });
  button.disabled = context.answering;
  button.addEventListener("click", (event) => {
    if (!isPersonEvent(event)) return;
    if (action.reauthorize !== undefined) context.reauthorize?.(action);
    else void context.answer(action.kind, action.value);
  });
  return button;
}

function textAnswer(presented: ChatAskPresentation, context: AskControlsContext): HTMLElement {
  const box = createElement("textarea", {
    className: "turn-answer-text",
    attrs: { rows: "3", "aria-label": "Your answer", ...(presented.textMax === undefined ? {} : { maxlength: String(presented.textMax) }) }
  });
  // Typed words outlive the controls' rebuild while an answer is on its way, and a refused answer keeps them.
  box.value = context.draft?.text ?? "";
  const send = createElement("button", { className: "small-button", text: "Send answer", attrs: { type: "button", "data-tone": "primary" } });
  box.disabled = context.answering;
  send.disabled = context.answering || box.value.trim() === "";
  box.addEventListener("input", () => {
    if (context.draft !== undefined) context.draft.text = box.value;
    send.disabled = context.answering || box.value.trim() === "";
  });
  const submit = (): void => {
    const words = box.value.trim();
    if (words === "" || context.answering) return;
    void Promise.resolve(context.answer("text", words)).then((outcome) => {
      if ((outcome as { ok?: unknown } | undefined)?.ok !== true) return;
      box.value = "";
      if (context.draft !== undefined) context.draft.text = "";
      send.disabled = true;
    });
  };
  send.addEventListener("click", (event) => {
    if (isPersonEvent(event)) submit();
  });
  box.addEventListener("keydown", (event) => {
    if (!isPersonEvent(event) || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || composerKeyAction(event, false) !== "send") return;
    event.preventDefault();
    submit();
  });
  const parts: HTMLElement[] = [box];
  if (presented.textHint !== undefined && presented.textHint !== "") parts.push(createElement("p", { className: "turn-note", text: presented.textHint }));
  parts.push(send);
  return createElement("div", { className: "turn-answer-form" }, parts);
}
