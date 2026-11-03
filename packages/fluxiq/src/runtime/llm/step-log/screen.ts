/** What a credential-shaped run of text is written as. */
export const AUTOMATION_STUDIO_LLM_STEP_LOG_REDACTED = "[redacted-credential]";

/**
 * A provider API key -- `sk-`, any dash-joined prefix such as `proj-`, then a
 * run of at least 20 key characters, never the tail of a longer word such as
 * `task-...` -- or a bearer token of at least 20 characters.
 *
 * Narrow on purpose: request.json is the exact body, and a looser shape
 * rewrote ordinary page text in it -- a class such as `sk-product-card-title`,
 * or "bearer instrument" -- so the file no longer matched what was sent.
 */
const CREDENTIAL_SHAPES = /(?<![A-Za-z0-9_-])sk-(?:[A-Za-z0-9]+-)*[A-Za-z0-9]{20,}(?![A-Za-z0-9])|\b[Bb]earer\s+[A-Za-z0-9._~+/=-]{20,}/gu;

/**
 * Every text the step log writes, screened for credential shapes.
 *
 * The step log is never handed the resolved key and never writes a header, so
 * this is the second line, not the first: a key that reached a page, a tool
 * result or a model's answer is still not written down.
 */
export function automationStudioLlmStepLogScreen(text: string): { text: string; redacted: boolean } {
  let redacted = false;
  const screened = text.replace(CREDENTIAL_SHAPES, () => {
    redacted = true;
    return AUTOMATION_STUDIO_LLM_STEP_LOG_REDACTED;
  });
  return { text: screened, redacted };
}
