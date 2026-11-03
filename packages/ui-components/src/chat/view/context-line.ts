// The slim line above an automation's or a question's chat (a chosen thread
// has the thread header instead): which automation
// this thread is about ("Automation Price tracker"), or whose question it
// holds ("The run's question"), and the way back to the latest chat. Hidden
// for the latest chat, which needs no introduction. Built once and updated in
// place.

import { createElement } from "../../dom/index.ts";
import type { ChatTarget } from "../target.ts";

/** The mounted line. */
export type ContextLine = {
  readonly element: HTMLElement;
  update(target: ChatTarget): void;
};

const SVG = "http://www.w3.org/2000/svg";

/** Creates the line; `back` is called when the person asks for the latest chat. */
export function createContextLine(back: () => void): ContextLine {
  const name = createElement("span", { className: "chat-context-name" });
  const backButton = createElement("button", {
    className: "chat-context-back",
    attrs: { type: "button", "aria-label": "Back to the latest chat", title: "Back to the latest chat" }
  }, [chevron(), createElement("span", { text: "Latest chat" })]);
  backButton.addEventListener("click", back);
  const kind = createElement("span", { className: "chat-context-kind", text: "Automation" });
  const element = createElement("div", { className: "chat-context", hidden: true }, [
    backButton,
    createElement("span", { className: "chat-context-about" }, [kind, name])
  ]);
  return {
    element,
    update(target) {
      // A chosen thread is named by the thread header, not here.
      const hidden = (target.kind === "latest" && target.projectId === undefined) || target.kind === "thread";
      if (element.hidden !== hidden) element.hidden = hidden;
      const text = target.kind === "automation" ? target.name.trim() || "This automation" : target.kind === "question" ? target.title : target.projectId !== undefined ? "Project chat" : "";
      if (name.textContent !== text) name.textContent = text;
      if (name.getAttribute("title") !== text) name.setAttribute("title", text);
      const automation = target.kind === "automation";
      if (kind.hidden === automation) kind.hidden = !automation;
    }
  };
}

function chevron(): SVGSVGElement {
  const svg = document.createElementNS(SVG, "svg");
  for (const [key, value] of [["viewBox", "0 0 16 16"], ["width", "14"], ["height", "14"], ["aria-hidden", "true"], ["focusable", "false"]]) svg.setAttribute(key!, value!);
  const path = document.createElementNS(SVG, "path");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.8");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  path.setAttribute("d", "M10 3.5 5.5 8l4.5 4.5");
  svg.append(path);
  return svg;
}
