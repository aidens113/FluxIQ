// The task's humanness on its answer card, folded behind a small "Humanness · 40"
// button so the card stays calm. It reads the task's level through the task settings
// port when the card first shows the task, and again each time it is opened, so a level
// changed on another card or screen is not shown stale. It stays hidden where the client
// cannot carry the read at all (`unsupported`); a read that failed otherwise says so
// inside, in the client's words.
//
// The answer view keeps this element across its redraws: the slider keeps its focus,
// its level and what it is saving while the card around it changes.

import { createElement } from "../../../dom/index.ts";
import { createHumannessControl, type HumannessControl, type HumannessLevel } from "../../controls/index.ts";
import type { ChatResult, ChatTaskRef, ChatTaskSettings, ChatTaskSettingsPort } from "../../ports/index.ts";

/** The section on one answer card. */
export type HumannessSection = {
  readonly element: HTMLElement;
  /** Shows `task`'s humanness, reading it the first time this task is shown. */
  show(task: ChatTaskRef): void;
};

let made = 0;

async function asked(call: () => Promise<ChatResult<ChatTaskSettings>>): Promise<ChatResult<ChatTaskSettings>> {
  try {
    return await call();
  } catch {
    return { ok: false, sentence: "Something went wrong. Try again." };
  }
}

/** A level from what the port read: a starting value that is not a number reads as 0, the last of the precedence. */
function levelOf(read: ChatTaskSettings): HumannessLevel {
  const starting = typeof read.starting === "number" ? read.starting : 0;
  return typeof read.humanness === "number" ? { own: read.humanness, starting } : { starting };
}

/** Creates the section over `port`. */
export function createHumannessSection(port: ChatTaskSettingsPort): HumannessSection {
  const id = `fluxiq-answer-humanness-${++made}`;
  let task: ChatTaskRef | undefined;
  let control: HumannessControl | undefined;
  let open = false;
  // Which read is the latest, so an older reply changes nothing.
  let reading = 0;
  const toggle = createElement("button", { className: "small-button answer-humanness-toggle", text: "Humanness", attrs: { type: "button", "aria-expanded": "false", "aria-controls": id } });
  const problem = createElement("p", { className: "answer-humanness-problem", hidden: true, attrs: { role: "alert" } });
  const panel = createElement("div", { id, className: "answer-humanness-panel", hidden: true }, [problem]);
  const element = createElement("div", { className: "answer-humanness", hidden: true }, [toggle, panel]);

  /** "Humanness · N": the level the task runs at, as saved. */
  function label(level: HumannessLevel): void {
    toggle.textContent = `Humanness · ${level.own ?? level.starting}`;
  }

  function settle(answer: ChatResult<ChatTaskSettings>, about: ChatTaskRef): void {
    if (answer.ok) {
      const level = levelOf(answer.value);
      problem.hidden = true;
      problem.textContent = "";
      if (control === undefined) {
        control = createHumannessControl({
          level,
          label: "Humanness for this task",
          commit: (humanness) => port.setHumanness({ projectId: about.projectId, taskId: about.taskId, humanness }),
          onLevel: label
        });
        panel.append(control.element);
      } else {
        control.show(level);
      }
      // A read while a change is on its way is not shown, so the label says what the control holds.
      label(control.level());
      element.hidden = false;
      return;
    }
    if (answer.unsupported === true && control === undefined) {
      element.hidden = true;
      return;
    }
    problem.textContent = `I could not read this task's humanness. ${answer.sentence}`;
    problem.hidden = false;
    element.hidden = false;
  }

  async function read(): Promise<void> {
    const about = task;
    if (about === undefined) return;
    const mine = ++reading;
    const answer = await asked(() => port.read(about));
    if (mine !== reading || about !== task) return;
    settle(answer, about);
  }

  toggle.addEventListener("click", () => {
    open = !open;
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    if (open) void read();
  });

  return {
    element,
    show(next) {
      if (task !== undefined && task.projectId === next.projectId && task.taskId === next.taskId) return;
      // Another task: its own control, so no level of the last one is sent for it.
      control?.dispose();
      control?.element.remove();
      control = undefined;
      task = { projectId: next.projectId, taskId: next.taskId };
      void read();
    }
  };
}
