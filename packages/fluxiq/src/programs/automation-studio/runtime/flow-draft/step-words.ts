// What a call names, in the domain's words, as the draft keeps them on its step.
//
// The loop asks the caller's `describeCall` (`../llm/loop-configuration.ts`) --
// the same answer the chat shows -- once, when the step is appended, so the
// draft line can say which control a handle named (`./entry.ts`, `does`). The
// words are the domain's own wording of the call, made from the names of
// controls the model was already shown; nothing here reads a page.
//
// A caller that offers nothing, answers nothing, or answers in another shape
// leaves the step without words, and the step is recorded exactly as it would
// have been. A describer that throws is not caught here: its contract is that an
// answer it cannot give is no answer, a throw is a fault in it, and Core's
// structure audit refuses a caught failure read as "no words" (`failure-as-empty`)
// -- the chat's observer, which asks first, lets it through the same way
// (`../activity/observer.ts`).

import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioFlowDraftStepWords } from "./step.ts";

/**
 * The most of each word a draft line carries. A control's visible words can be
 * a whole container's text; the line names the control, it does not quote it.
 */
const MAX_WORDS = 160;

/** The domain's words for one call, or nothing when it has none to give. */
export function automationStudioFlowDraftStepWordsOf(
  describe: ((call: { toolId: string; value: JsonObject }) => unknown) | undefined,
  call: { toolId: string; value: JsonObject }
): AutomationStudioFlowDraftStepWords | undefined {
  if (!describe) return undefined;
  const answer: unknown = describe({ toolId: call.toolId, value: call.value });
  if (!answer || typeof answer !== "object" || Array.isArray(answer)) return undefined;
  const target = said((answer as { target?: unknown }).target);
  const text = said((answer as { text?: unknown }).text);
  if (target === undefined && text === undefined) return undefined;
  return { ...(target === undefined ? {} : { target }), ...(text === undefined ? {} : { text }) };
}

/** A word as the line carries it: control characters and whitespace folded, bounded, or nothing. */
function said(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const folded = value.replace(/[\u0000-\u001f\u007f]+/gu, " ").replace(/\s+/gu, " ").trim();
  if (!folded) return undefined;
  return folded.length > MAX_WORDS ? `${folded.slice(0, MAX_WORDS - 3).trimEnd()}...` : folded;
}
