// A judge's advice to add a field to a read this build was refused for its
// field's cut-short text, said as the order that can pass (S5).
//
// Social rerun rounds 3 and 4 (`run-mvgw3ve5-294881b5`, 0114, 0115, 0151): the
// judged run lacked a column the request asks for, and the judges advised
// adding it to the same read. A read of that listing with that field had been
// refused `incomplete_text` in the build already -- the field's text was cut
// short on the page behind each row's own disclosure control -- and the builder
// did as advised (0117), and the next trial was refused the same way (0119).
//
// So a builder's memory of its trials (`./repeated-advice.ts`) also keeps
// whether a read in this build was refused for a cut-short text field: a tool
// call whose answer is refused with the closed reason `incomplete_text` (the
// downstream domain's refusal detail, `detail.reason`, with the field's key in
// `detail.missing`), or a trial step whose `actual` starts with that closed
// marker. Once one was, each sentence of a judged no's advice -- or of an
// unsure's or a held yes's reading -- that asks to add or include a field or
// column is replaced by Core's sentence for the disclosure order: read the
// row-context columns without the field, repeat over that read pressing each
// kept row's own disclosure control, then read the same listing again with the
// field, both reads under the same conditions. Core's sentence is said once per
// advice; every other sentence stays as it was. Advice is never rewritten
// before such a refusal, and nothing here judges the advice wrong otherwise.
//
// Generic words only: no site's, task's or list's terms.
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";

/** The closed refusal reason, and the closed marker a step's `actual` starts with, for a read whose text field was cut short. */
const INCOMPLETE_TEXT = "incomplete_text";
/** Where one sentence ends and the next begins (as `./repeated-advice.ts` reads advice). */
const SENTENCE_END = /(?<=[.!?])\s+(?=["'(\[\p{Lu}])/u;
/** A judge call's own prefix, labelled or not, kept in front of a replaced sentence. */
const CALL_PREFIX = /^Judge call [12](?: \([^)]*\))?: /u;
/** A sentence that asks to add or include a field or column. */
const ADDS_FIELD = [/\b(?:add|adding|include|including|put back)\b[^.!?]*\b(?:field|column)s?\b/iu, /\b(?:field|column)s?\b[^.!?]*\b(?:added|included)\b/iu];
/** A field key the note may name: an identifier, as the refusal's own keys are. */
const KEY_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/u;
/** Said in place of a later judge call's add-a-field sentence, once Core's order was said. */
const AS_ABOVE = "Core: this call also asked to add the field to the same read; follow the order above instead.";
/** The most keys the note names. */
const MAX_KEYS = 3;

/** One build's record of reads refused for a cut-short text field, and the advice its builders are shown (header). */
export class AutomationStudioSubflowDisclosureAdvice {
  private refused = false;
  private readonly keys = new Set<string>();

  /** Records a tool call's answer: a read refused for a cut-short text field (header). */
  saw(ran: unknown): void {
    const evidence = evidenceOf(ran);
    const detail = isObject(evidence) && evidence.ok === false && isObject(evidence.detail) ? evidence.detail : undefined;
    if (detail?.reason !== INCOMPLETE_TEXT) return;
    this.refused = true;
    for (const key of Array.isArray(detail.missing) ? detail.missing : []) {
      if (typeof key === "string" && KEY_NAME.test(key)) this.keys.add(key);
    }
  }

  /** The test tool's answer as the builder is shown it: advice to add a field said as the disclosure order once a read was refused for one (header). Records the trial's own refused steps first. */
  told<T extends { evidence: JsonValue }>(answered: T): T {
    const evidence = answered.evidence;
    if (!isObject(evidence) || typeof evidence.verdict !== "string" || !isObject(evidence.feedback)) return answered;
    const feedback = evidence.feedback;
    if (stepRefused(feedback)) this.refused = true;
    if (!this.refused) return answered;
    const judge = isObject(feedback.judge) ? rewritten(feedback.judge, this.order()) : undefined;
    const unconfirmed = isObject(feedback.unconfirmedReading) ? rewritten(feedback.unconfirmedReading, this.order()) : undefined;
    const answeredReading = isObject(feedback.answeredReading) ? rewritten(feedback.answeredReading, this.order()) : undefined;
    if (!judge && !unconfirmed && !answeredReading) return answered;
    const told: JsonObject = { ...feedback, ...(judge ? { judge } : {}), ...(unconfirmed ? { unconfirmedReading: unconfirmed } : {}), ...(answeredReading ? { answeredReading } : {}) };
    return { ...answered, evidence: { ...evidence, feedback: told } } as T;
  }

  /** Core's sentence for the disclosure order, naming the refused field where the refusal named one. */
  private order(): string {
    const keys = [...this.keys].slice(-MAX_KEYS);
    const field = keys.length ? `the field ${keys.map((key) => `\`${key}\``).join(" or ")}` : "the text field";
    return `Core: a read in this build was already refused because ${field} was cut short on the page (incomplete_text), so adding it to the same read would be refused again. `
      + `Do this in order instead: read the listing's row-context columns without ${field}; then repeat over that read, pressing each kept row's own disclosure control; `
      + `then, after that repeat, not inside it, read the same listing again with ${field}. Give both reads the same conditions, so every row the final read keeps was disclosed by the repeat.`;
  }
}

/** A reading or judge object with its advice's add-a-field sentences replaced by `order`, once; undefined when none asked that. */
function rewritten(holder: JsonObject, order: string): JsonObject | undefined {
  if (typeof holder.advice !== "string") return undefined;
  let said = false;
  let changed = false;
  const sentences = holder.advice.split(SENTENCE_END).flatMap((sentence) => {
    if (!ADDS_FIELD.some((pattern) => pattern.test(sentence))) return [sentence];
    changed = true;
    const prefix = CALL_PREFIX.exec(sentence)?.[0] ?? "";
    if (said) return prefix ? [`${prefix}${AS_ABOVE}`] : [];
    said = true;
    return [`${prefix}${order}`];
  });
  return changed ? { ...holder, advice: sentences.join(" ") } : undefined;
}

/** Whether a trial's steps include one refused for a cut-short text field, by the closed marker its `actual` starts with. */
function stepRefused(feedback: JsonObject): boolean {
  const steps = Array.isArray(feedback.steps) ? feedback.steps : [];
  return steps.some((step) => isObject(step) && typeof step.actual === "string" && step.actual.startsWith(INCOMPLETE_TEXT));
}

/** A tool answer's evidence: the execution result's, or the answer itself. */
function evidenceOf(ran: unknown): unknown {
  return isObject(ran) && ran.kind === "llm_evidence_tool_execution" ? ran.evidence : ran;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
