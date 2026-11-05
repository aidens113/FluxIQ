import { createElement } from "../../../../dom/index.ts";
import type { SubflowCard, SubflowRunOutcome } from "../../types.ts";
import { handedBackLines, joinWords, lastingDone, runOutcomeWords } from "../../words/index.ts";
import { lines } from "../lines.ts";
import { resultButton } from "./result-button.ts";
import type { RunResultHooks } from "./result-hooks.ts";

/** A run that took place: finished or stopped, in honest words, with what it handed back. It never claims a tick, because nothing here checked it. */
export function outcomePanel(outcome: SubflowRunOutcome, card: SubflowCard, hooks: RunResultHooks): HTMLElement {
  const root = createElement("div", { className: "library-result" });
  root.append(createElement("p", { className: "library-result-heading", text: runOutcomeWords(outcome), attrs: { tabindex: "-1", "data-focus": "result" } }));
  const back = handedBackLines(outcome, card);
  if (back.length > 0) root.append(createElement("h3", { className: "library-section-title", text: "It handed back" }), lines(back));
  if (outcome.acts.length > 0) root.append(createElement("p", { text: `On the site it ${joinWords(outcome.acts.map(lastingDone))}.` }));
  if (outcome.status === "succeeded") root.append(createElement("p", { className: "library-quiet", text: "FluxIQ has not checked this result." }));
  root.append(createElement("div", { className: "library-actions" }, [resultButton("Try again", "library-secondary", hooks.tryAgain), resultButton("Ask about it", "library-secondary", hooks.ask)]));
  return root;
}
