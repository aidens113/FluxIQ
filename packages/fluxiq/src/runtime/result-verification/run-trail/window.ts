// Which form of a judge's summary to send, measured conservatively against the judging model's window (t965).
//
// **Why.** Live run `run-mwodpw10-3d5748ab`, judge 0117: a 2.22 MB request was measured by Core's estimator
// (UTF-8 bytes / 3, `../../models/limits/token-estimation.ts`) at about 740k tokens, which fit a 1M window
// beside a 128k reply, so no shorter form was taken, and Anthropic counted it past its window and refused it
// (HTTP 400), three times, read as "not judged". Across that run's 37 calls with a reported count, Claude's
// tokenizer gave 2.02-3.00 bytes per token, and every judge request 2.02-2.03: bytes / 3 under-counts every one,
// by half on a judge's. The judge cannot ask the provider to count first, since a request's forms are chosen as it
// is built, so a judge's summary is measured here at `BYTES_PER_TOKEN`, below the densest seen, and the first form
// whose measure fits the window beside the reply is the one offered: the whole summary wherever it fits.
//
// **A refusal for size is a defect of ours.** Where the provider still refuses a request as too large for the model
// (`AUTOMATION_STUDIO_RESULT_SIZE_REFUSED`), the judge asks again with the next shorter form, never reads it as not
// judged while one is left (`../flow-less/judge.ts`, `../verify.ts`).

import type { JsonValue } from "../../../core/index.ts";
import { resolveAutomationStudioLlmTokenLimits, type AutomationStudioLlmTokenLimits } from "../../models/limits/index.ts";

/** Below the densest judge request measured (2.02 bytes a token, run-mwodpw10-3d5748ab): about a tenth to spare. */
const BYTES_PER_TOKEN = 1.8;
/** What a judge's request holds beside its summary: the system prompt, the reply's schema twice and the framing (about 48 KB in 0091). */
const FRAMING_BYTES = 64 * 1024;

/** The provider refused the request as larger than its model's window: the adapter's own check, or the provider's count. */
export const AUTOMATION_STUDIO_RESULT_SIZE_REFUSED = "llm.provider_input_budget_exceeded";

/**
 * The index in `forms` (the whole summary first, then each shorter form, shortest last) of the first whose
 * conservative measure, with `besideBytes` of the request's own text (the person's words), fits `tokenLimits`
 * beside the reply; the last where none does.
 */
export function automationStudioResultSummaryFormForWindow(forms: readonly unknown[], tokenLimits: Partial<AutomationStudioLlmTokenLimits> | undefined, besideBytes: number): number {
  const { limits } = resolveAutomationStudioLlmTokenLimits(tokenLimits);
  const fits = (form: unknown): boolean => {
    const tokens = Math.ceil((Buffer.byteLength(JSON.stringify(form as JsonValue), "utf8") + besideBytes + FRAMING_BYTES) / BYTES_PER_TOKEN);
    return tokens <= limits.maxInputTokens && tokens + limits.maxOutputTokens <= limits.maxTotalTokens;
  };
  const at = forms.findIndex(fits);
  return at === -1 ? Math.max(forms.length - 1, 0) : at;
}
