import { createElement } from "../../../../dom/index.ts";
import type { SubflowCard } from "../../types.ts";
import { joinWords, lastingVerb } from "../../words/index.ts";

let next = 0;

/** What the form is told: what is typed so far (kept across redraws), whether a run is under way, and what is still missing. */
export type RunFormState = { values: Map<string, string>; busy: boolean; missing: readonly string[] };

/**
 * The inputs of a run, each with a real label that says in words whether it is required, and the Run button, which
 * says Running and cannot be pressed again while a run is under way. It also says what the subflow can do, so a
 * lasting act is never a surprise.
 */
export function runForm(card: SubflowCard, state: RunFormState, submit: () => void): HTMLElement {
  const form = createElement("form", { className: "library-form", attrs: { novalidate: "" } });
  form.addEventListener("submit", (event) => {
    (event as Event).preventDefault?.();
    submit();
  });
  if (card.inputs.length === 0) form.append(createElement("p", { className: "library-quiet", text: "It needs nothing from you." }));
  for (const input of card.inputs) {
    next += 1;
    const id = `library-input-${next}`;
    const field = createElement("input", { id, className: "library-input", attrs: { type: "text", autocomplete: "off", ...(input.required ? { "aria-required": "true" } : {}) } });
    field.value = state.values.get(input.id) ?? "";
    field.disabled = state.busy;
    field.addEventListener("input", () => state.values.set(input.id, field.value));
    const lacking = state.missing.includes(input.id);
    if (lacking) field.setAttribute("aria-invalid", "true");
    form.append(
      createElement("div", { className: "library-field" }, [
        createElement("label", { className: "library-label", attrs: { for: id } }, [input.name, createElement("span", { className: "library-label-note", text: input.required ? " (required)" : " (optional)" })]),
        field,
        ...(lacking ? [createElement("span", { className: "library-field-note", text: "Fill this in to run it.", attrs: { role: "alert" } })] : [])
      ])
    );
  }
  if (card.lastingClasses.length > 0) form.append(createElement("p", { className: "library-quiet", text: `Running it can ${joinWords(card.lastingClasses.map(lastingVerb))}.` }));
  const go = createElement("button", { className: "library-primary", text: state.busy ? "Running..." : "Run", attrs: { type: "submit", ...(state.busy ? { "aria-busy": "true" } : {}) } });
  go.disabled = state.busy;
  form.append(go);
  return form;
}
