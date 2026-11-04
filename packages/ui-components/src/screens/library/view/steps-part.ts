import { createElement } from "../../../dom/index.ts";
import type { SubflowDetail } from "../types.ts";
import { joinWords, lastingWords } from "../words/index.ts";
import { callList } from "./call-list.ts";
import { detailSection } from "./detail-section.ts";
import type { LibraryViewContext } from "./view-context.ts";

/** The steps in order, then what it calls. Until the read arrives, or if it fails, the part says so quietly and offers Try again. */
export function stepsPart(
  state: { detail: SubflowDetail | undefined; loading: boolean; problem: string | undefined },
  hooks: { retry(): void; open(partId: string, key: string): void },
  context: LibraryViewContext
): HTMLElement {
  const { detail } = state;
  if (detail === undefined) {
    if (state.problem === undefined) return detailSection("Steps, in order", [createElement("p", { className: "library-quiet", text: state.loading ? "Reading the steps..." : "" })]);
    const retry = createElement("button", { className: "library-link", text: "Try again", attrs: { type: "button" } });
    retry.addEventListener("click", hooks.retry);
    return detailSection("Steps, in order", [createElement("p", { className: "library-note", attrs: { role: "status" } }, [`${state.problem} `, retry])]);
  }
  const steps =
    detail.steps.length > 0
      ? createElement("ol", { className: "library-steps" }, detail.steps.map((step) => createElement("li", { text: step.lastingClasses.length > 0 ? `${step.label} (${joinWords(step.lastingClasses.map(lastingWords))})` : step.label })))
      : createElement("p", { text: "No steps are listed." });
  const root = createElement("div", { className: "library-group" }, [detailSection("Steps, in order", [steps])]);
  if (detail.calls.length > 0) root.append(detailSection("What it calls (press to open)", [callList(detail.calls, hooks.open, context)]));
  return root;
}
