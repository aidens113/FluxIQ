import { createElement } from "../../../../dom/index.ts";
import type { ChatResult } from "../../../../chat/ports/index.ts";
import type { SubflowCard, SubflowLastingClass, SubflowRefusal, SubflowRunOutcome } from "../../types.ts";
import { refusalWords, runOutcomeWords } from "../../words/index.ts";
import { outcomePanel } from "./outcome-panel.ts";
import { refusalPanel } from "./refusal-panel.ts";
import { runForm } from "./form.ts";
import type { RunResultHooks } from "./result-hooks.ts";
import type { LibraryViewContext } from "../view-context.ts";
import { viewHeader } from "../view-header.ts";

/** What the run view asks of the screen. */
export type LibraryRunHooks = {
  back(): void;
  /** Fills the composer with `text` and shows Chat. */
  ask(text: string): void;
  run(query: { inputs: Record<string, string>; permitted: SubflowLastingClass[]; acknowledgedRepeat: boolean }): Promise<ChatResult<SubflowRunOutcome | SubflowRefusal>>;
};

type Phase =
  | { kind: "form"; missing: readonly string[] }
  | { kind: "running" }
  | { kind: "unreached"; sentence: string }
  | { kind: "refused"; refusal: SubflowRefusal }
  | { kind: "done"; outcome: SubflowRunOutcome };

/**
 * Running one subflow: a small form for what it needs, then the run told honestly. A permission for a lasting act is
 * one press, once, never a PIN; a repeat is one press, once. The button says Running and cannot be pressed twice.
 * A run ends as finished or stopped, never as a failed ending, and never with a tick.
 */
export function runView(card: SubflowCard, hooks: LibraryRunHooks, context: LibraryViewContext): HTMLElement {
  const values = new Map<string, string>();
  const allowed = new Set<SubflowLastingClass>();
  let repeat = false;
  let phase: Phase = { kind: "form", missing: [] };
  const body = createElement("div", { className: "library-run-body", attrs: { "aria-live": "polite" } });

  const askText = (): string => {
    const name = `“${card.name}”`;
    if (phase.kind === "done") return `My ${name} subflow ${runOutcomeWords(phase.outcome).replace(/^It /u, "").replace(/^\w/u, (letter) => letter.toLowerCase())} What should I do next?`;
    if (phase.kind === "refused") return `I tried to run my ${name} subflow and it did not run. ${refusalWords(phase.refusal, card).says} What should I do?`;
    return `About my ${name} subflow: `;
  };
  const result: RunResultHooks = {
    tryAgain: () => {
      phase = { kind: "form", missing: [] };
      draw(true);
    },
    ask: () => hooks.ask(askText()),
    allow: (classes) => {
      classes.forEach((item) => allowed.add(item));
      void go();
    },
    goAhead: () => {
      repeat = true;
      void go();
    }
  };

  function draw(focusForm = false): void {
    if (phase.kind === "form" || phase.kind === "running") {
      const form = runForm(card, { values, busy: phase.kind === "running", missing: phase.kind === "form" ? phase.missing : [] }, () => void go());
      body.replaceChildren(form);
      if (focusForm || (phase.kind === "form" && phase.missing.length > 0)) (form.querySelectorAll("input")[0] ?? form.querySelectorAll("button")[0])?.focus();
      return;
    }
    const panel =
      phase.kind === "done"
        ? outcomePanel(phase.outcome, card, result)
        : phase.kind === "refused"
          ? refusalPanel(phase.refusal, card, { allowed, repeat }, result)
          : unreached(phase.sentence);
    body.replaceChildren(panel);
    (panel.children[0] as HTMLElement | undefined)?.focus();
  }

  function unreached(sentence: string): HTMLElement {
    const again = createElement("button", { className: "library-secondary", text: "Try again", attrs: { type: "button" } });
    again.addEventListener("click", result.tryAgain);
    const ask = createElement("button", { className: "library-secondary", text: "Ask about it", attrs: { type: "button" } });
    ask.addEventListener("click", result.ask);
    return createElement("div", { className: "library-result" }, [
      createElement("p", { className: "library-result-heading", text: "FluxIQ could not be reached, so it is not known whether this ran.", attrs: { tabindex: "-1" } }),
      createElement("p", { text: `${sentence} Look at the site before you run it again.` }),
      createElement("div", { className: "library-actions" }, [again, ask])
    ]);
  }

  async function go(): Promise<void> {
    if (phase.kind === "running") return;
    const missing = card.inputs.filter((input) => input.required && (values.get(input.id) ?? "").trim() === "").map((input) => input.id);
    if (missing.length > 0) {
      phase = { kind: "form", missing };
      draw();
      return;
    }
    phase = { kind: "running" };
    draw();
    const inputs: Record<string, string> = {};
    for (const input of card.inputs) {
      const typed = (values.get(input.id) ?? "").trim();
      if (typed !== "") inputs[input.id] = typed;
    }
    const answer = await hooks.run({ inputs, permitted: [...allowed], acknowledgedRepeat: repeat });
    if (!answer.ok) phase = { kind: "unreached", sentence: answer.sentence };
    else if (answer.value.refused) phase = { kind: "refused", refusal: answer.value };
    else phase = { kind: "done", outcome: answer.value };
    draw();
  }

  draw();
  return createElement("div", { className: "library-run" }, [viewHeader(card.name, hooks.back, context, "Run it now"), body]);
}
