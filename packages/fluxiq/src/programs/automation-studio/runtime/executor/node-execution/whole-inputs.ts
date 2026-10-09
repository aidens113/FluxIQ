import type { AutomationStudioNodeAttemptTrace } from "../contracts.ts";
import { automationStudioAttemptInputs } from "./attempt-inputs.ts";

/** How deep an answer is walked for traces: a session's trace sits at depth one, a Call Flow child's a few levels below. */
const MAXIMUM_ANSWER_DEPTH = 32;

/**
 * The answer with every saved trace in it reading as the run executed it: each
 * attempt's whole `inputs`, and no `inputsSince`.
 *
 * A saved trace keeps each value once (`./shared-inputs.ts`), which is a storage
 * concern. A client -- the web panel's run detail, the extension, the Lab --
 * reads `attempt.inputs` as every value the node saw, so an endpoint answering
 * with a saved trace hands it through here and the shared form never leaves
 * Core. Any object holding an `attempts` list of attempt records is taken for a
 * trace: a runtime session's `trace`, a Call Flow attempt's `childTrace`, a
 * repair's `completedTrace` kept in a run detail. Walked by identity once, and
 * an answer with no shared trace in it is handed back as it came.
 */
export function automationStudioWithWholeAttemptInputs<TAnswer>(answer: TAnswer): TAnswer {
  return wholeIn(answer, new Map(), 0) as TAnswer;
}

/** What each object of the answer became, so an object it holds twice is walked once and reads the same both times. */
type Walked = Map<object, unknown>;

function wholeIn(value: unknown, walked: Walked, depth: number): unknown {
  if (!value || typeof value !== "object" || depth >= MAXIMUM_ANSWER_DEPTH) return value;
  if (walked.has(value)) return walked.get(value);
  walked.set(value, value);
  const whole = Array.isArray(value) ? wholeItems(value, walked, depth) : wholeFields(value as Record<string, unknown>, walked, depth, undefined);
  walked.set(value, whole);
  return whole;
}

function wholeItems(items: unknown[], walked: Walked, depth: number): unknown[] {
  let changed = false;
  const whole = items.map((item) => {
    const next = wholeIn(item, walked, depth + 1);
    if (next !== item) changed = true;
    return next;
  });
  return changed ? whole : items;
}

/** Every field walked, `skip` excepted; an `attempts` list of attempt records is read whole first. */
function wholeFields(record: Record<string, unknown>, walked: Walked, depth: number, skip: string | undefined): Record<string, unknown> {
  let changed = false;
  const copy: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(record)) {
    const next = key === skip ? item : key === "attempts" && isAttemptList(item) ? wholeAttempts(item, walked, depth + 1) : wholeIn(item, walked, depth + 1);
    if (next !== item) changed = true;
    copy[key] = next;
  }
  return changed ? copy : record;
}

function isAttemptList(value: unknown): value is AutomationStudioNodeAttemptTrace[] {
  return Array.isArray(value) && value.length > 0 && value.every((item) => Boolean(item) && typeof item === "object" && typeof (item as { attemptId?: unknown }).attemptId === "string");
}

// An attempt's whole inputs are not walked: they share their values with other
// attempts, and walking each copy again would cost the square the saved form
// exists to avoid. Every other field is, so a Call Flow child's trace -- or a
// repair attempt's `completedTrace` -- reads whole as well.
function wholeAttempts(attempts: AutomationStudioNodeAttemptTrace[], walked: Walked, depth: number): AutomationStudioNodeAttemptTrace[] {
  let changed = false;
  const whole = attempts.map((attempt, index) => {
    let current: AutomationStudioNodeAttemptTrace = attempt;
    if (attempt.inputsSince) {
      const { inputsSince: _kept, ...rest } = attempt;
      current = { ...rest, inputs: automationStudioAttemptInputs(attempts, index) };
    }
    current = wholeFields(current as unknown as Record<string, unknown>, walked, depth + 1, "inputs") as unknown as AutomationStudioNodeAttemptTrace;
    if (current !== attempt) changed = true;
    return current;
  });
  return changed ? whole : attempts;
}
