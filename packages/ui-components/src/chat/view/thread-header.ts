// The line above the stream when the chat holds a list of threads: a picker
// when there is more than one thread to choose from, otherwise the chat's name
// in words (a host with a title bar of its own hears the name instead, and the
// header then shows only the picker). No Refresh control: the chat reads on
// its own. Built once and updated in place, so an open picker keeps its focus.

import { createElement } from "../../dom/index.ts";
import type { ThreadOption } from "../conversation/index.ts";

/** What the header shows. */
export type ThreadHeaderModel = {
  /** The threads to choose from, in list order. */
  options: readonly ThreadOption[];
  /** The thread on screen, when it is one of the options. */
  selectedId: string | undefined;
  /** The chat's name, never an id. */
  title: string;
  /** Whether the header says the name itself when there is no picker. */
  showTitle: boolean;
};

/** The mounted header. */
export type ThreadHeader = {
  readonly element: HTMLElement;
  update(model: ThreadHeaderModel): void;
};

/** Creates the header; `pick` hears the thread the person chose. */
export function createThreadHeader(pick: (conversationId: string) => void): ThreadHeader {
  const select = createElement("select", { className: "chat-thread-select" });
  const picker = createElement("label", { className: "chat-thread-picker", hidden: true }, [
    createElement("span", { className: "chat-sr-only", text: "Thread" }),
    select
  ]);
  const title = createElement("strong", { className: "chat-thread-title", hidden: true });
  const element = createElement("header", { className: "chat-thread-header", hidden: true }, [picker, title]);
  let shownOptions = "";
  select.addEventListener("change", () => pick(select.value));
  return {
    element,
    update(model) {
      const choosing = model.options.length > 1;
      const naming = !choosing && model.showTitle;
      if (picker.hidden === choosing) picker.hidden = !choosing;
      if (title.hidden === naming) title.hidden = !naming;
      if (element.hidden === (choosing || naming)) element.hidden = !(choosing || naming);
      if (title.textContent !== model.title) title.textContent = model.title;
      const signature = JSON.stringify(model.options);
      if (signature !== shownOptions) {
        shownOptions = signature;
        select.replaceChildren(...model.options.map((option) => {
          const line = createElement("option", { text: option.label });
          line.value = option.conversationId;
          return line;
        }));
      }
      const wanted = model.selectedId ?? "";
      if (choosing && select.value !== wanted) select.value = wanted;
    }
  };
}
