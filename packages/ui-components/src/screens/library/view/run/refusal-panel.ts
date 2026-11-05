import { createElement } from "../../../../dom/index.ts";
import type { SubflowCard, SubflowLastingClass, SubflowRefusal } from "../../types.ts";
import { joinWords, lastingVerb, refusalWords } from "../../words/index.ts";
import { resultButton } from "./result-button.ts";
import type { RunResultHooks } from "./result-hooks.ts";

/**
 * A run that was refused, with nothing changed on the site. A permission or a repeat is asked once, in one press,
 * and only while it has not been given; everything else offers Try again and Ask about it.
 */
export function refusalPanel(refusal: SubflowRefusal, card: SubflowCard, granted: { allowed: ReadonlySet<SubflowLastingClass>; repeat: boolean }, hooks: RunResultHooks): HTMLElement {
  const words = refusalWords(refusal, card);
  const root = createElement("div", { className: "library-result" }, [
    createElement("p", { className: "library-result-heading", text: words.says, attrs: { tabindex: "-1", "data-focus": "result" } }),
    createElement("p", { text: words.next })
  ]);
  const needed = words.classes.filter((item) => !granted.allowed.has(item));
  const actions: HTMLElement[] = [];
  if (words.ask === "allow" && needed.length > 0) actions.push(resultButton(`Allow it to ${joinWords(needed.map(lastingVerb))} this once`, "library-primary", () => hooks.allow(needed)));
  else if (words.ask === "repeat" && !granted.repeat) actions.push(resultButton("Go ahead", "library-primary", hooks.goAhead));
  actions.push(resultButton("Try again", "library-secondary", hooks.tryAgain), resultButton("Ask about it", "library-secondary", hooks.ask));
  root.append(createElement("div", { className: "library-actions" }, actions));
  return root;
}
