// Reading a person's message: ask the model, retry what is worth retrying, and
// never come back empty-handed.
//
// The model call is the part that can fail -- a timeout, a rate limit, a
// network blip, an answer that is not the shape it was asked for -- and none of
// those is a reason for a person's message to go unanswered. So:
//
// - A thrown call is tried again, up to three attempts inside one deadline,
//   with a short backoff. Each attempt ends on Core's own timer, even when the
//   model goes on waiting past its signal (`attemptWithin`). A failure the
//   provider marks `retryable: false` (a refused credential, a request it will
//   never accept) is not retried, because trying again would only make the
//   person wait for the same answer.
// - An answer that tried to be an object and could not be read is asked for
//   again with the reason, which a model almost always corrects.
// - A reply to a message the model declared a task, or a reply that declared
//   nothing (`./unanswered-task.ts`), is asked again on the same model with a
//   correction. Still a reply after that, a declared task starts from the open
//   page (`./unanswered-route.ts`); never a silent stall.
// - When the model cannot be used at all -- none is connected, or every attempt
//   failed -- Core reads the words itself (`fallback.ts`) and records why, so
//   the thread can say so in plain English.

import { readModelAccessState, type ModelAccessState } from "@fluxiq/contracts/platform";
import type { AutomationStudioConversationDecision, AutomationStudioConversationInterpretation } from "./decision.ts";
import { automationStudioConversationFallbackDecision } from "./fallback.ts";
import { automationStudioConversationDeclaredIntent } from "./intent.ts";
import type { AutomationStudioConversationDecisionContext } from "./invocation.ts";
import type { AutomationStudioConversationCaller, AutomationStudioConversationModel, AutomationStudioConversationModelTurn } from "./model.ts";
import { parseAutomationStudioConversationDecision } from "./parse.ts";
import { automationStudioConversationInstructions } from "./prompt.ts";
import { automationStudioConversationUnansweredTaskDecision } from "./unanswered-route.ts";
import { automationStudioConversationUnansweredTask } from "./unanswered-task.ts";

export type AutomationStudioConversationInterpretLimits = {
  attempts: number;
  attemptTimeoutMs: number;
  /** The whole interpretation, retries included. Inside the panel's thirty seconds for a write. */
  deadlineMs: number;
  backoffMs: number;
};

export const AUTOMATION_STUDIO_CONVERSATION_INTERPRET_LIMITS: AutomationStudioConversationInterpretLimits = Object.freeze({
  attempts: 3,
  attemptTimeoutMs: 15_000,
  deadlineMs: 24_000,
  backoffMs: 400
});

export type AutomationStudioConversationInterpretInput = {
  model: AutomationStudioConversationModel | null;
  message: string;
  transcript: readonly AutomationStudioConversationModelTurn[];
  transcriptWithheld: boolean;
  context: AutomationStudioConversationDecisionContext;
  /** The bound domain's own system instructions, already checked at bind time; placed by `prompt.ts`. */
  domainInstructions?: string | undefined;
  /** Who sent it; the model's key may be released only to them. */
  caller?: AutomationStudioConversationCaller | null;
  limits?: Partial<AutomationStudioConversationInterpretLimits>;
  /** A test shortens time; production waits for real. */
  clock?: { now(): number; wait(ms: number): Promise<void> };
};

const REAL_CLOCK = { now: () => Date.now(), wait: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)) };
const UNREADABLE = 'Your last answer could not be read. Answer with exactly one JSON object: {"do": ..., "with": {...}}, {"ask": ...} or {"reply": ...}.';

export async function interpretAutomationStudioConversationTurn(input: AutomationStudioConversationInterpretInput): Promise<AutomationStudioConversationInterpretation> {
  const limits = { ...AUTOMATION_STUDIO_CONVERSATION_INTERPRET_LIMITS, ...input.limits };
  const clock = input.clock ?? REAL_CLOCK;
  if (!input.model) return fallback(input, "no model is connected to the conversation yet", 0);

  const instructions = automationStudioConversationInstructions(input.context, { transcriptWithheld: input.transcriptWithheld, domainInstructions: input.domainInstructions });
  const started = clock.now();
  let correction: string | null = null;
  let problem = "the model did not answer";
  let attempts = 0;
  // The sender's model access, when the last attempt failed for an access reason (`modelAccessOf`).
  let access: ModelAccessState | null = null;
  // What the attempts were priced at, summed, and how many were priced; undefined until one is.
  let costUsd: number | undefined;
  let pricedCalls = 0;
  const paid = (usd: number) => {
    if (!Number.isFinite(usd) || usd < 0) return;
    costUsd = (costUsd ?? 0) + usd;
    pricedCalls += 1;
  };
  // A task left unanswered in words: its last reply, and whether any answer declared it a task.
  let lastReply: Extract<AutomationStudioConversationDecision, { kind: "reply" }> | undefined;
  let declaredTask = false;
  while (attempts < limits.attempts) {
    const remaining = limits.deadlineMs - (clock.now() - started);
    if (remaining <= 0) {
      problem = "the model did not answer in time";
      break;
    }
    attempts += 1;
    try {
      const model = input.model;
      const raw = await attemptWithin(Math.min(limits.attemptTimeoutMs, remaining), (signal) => model.decide(
        { instructions, transcript: [...input.transcript], message: input.message, correction },
        { signal, caller: input.caller ?? null, paid }
      ));
      // The model answered, so an earlier attempt's access failure is no longer the reason.
      access = null;
      const decision = parseAutomationStudioConversationDecision(raw, input.context);
      const intent = decision ? automationStudioConversationDeclaredIntent(raw) : null;
      const unanswered = decision ? automationStudioConversationUnansweredTask(decision, intent) : null;
      if (decision && !unanswered) return { decision, source: "model", modelProblem: null, attempts, ...priced(costUsd, pricedCalls) };
      if (decision?.kind === "reply" && unanswered) {
        // A task answered in words, or a reply that declared nothing: ask the same model with clear feedback.
        lastReply = decision;
        declaredTask ||= intent === "task";
        correction = unanswered.correction;
        problem = "the model answered a task in words instead of starting it";
        continue;
      }
      correction = UNREADABLE;
      problem = "the model's answer could not be read";
    } catch (error) {
      access = modelAccessOf(error);
      problem = access?.message ?? automationStudioConversationModelProblem(error);
      // No key, a key that cannot be opened or used, or the provider refusing it: the same call meets
      // the same reason, so it is said now. A provider out of reach is tried again first.
      if (access && (error as { retryable?: unknown }).retryable !== true) return { ...accessReading(input, access, attempts), ...priced(costUsd, pricedCalls) };
      // With no usable key the words are still read: a confident match (running a saved Flow,
      // which needs no model) still acts. Anything else gets the setup message alone, not an
      // unrelated "could not tell what you wanted" ahead of it.
      if (keySetupProblem(problem)) {
        const matched = fallback(input, problem, attempts);
        return { ...(matched.decision.kind === "reply" ? setupReply(problem, attempts) : matched), ...priced(costUsd, pricedCalls) };
      }
      if ((error as { retryable?: unknown } | null)?.retryable === false) break;
      await clock.wait(Math.min(limits.backoffMs * 2 ** (attempts - 1), Math.max(0, limits.deadlineMs - (clock.now() - started))));
    }
  }
  if (access) return { ...accessReading(input, access, attempts), ...priced(costUsd, pricedCalls) };
  // Asked again on the same model and still answered in words: a declared task starts, anything else keeps the model's own reply (`./unanswered-route.ts`). Never a stall.
  if (lastReply) return { decision: automationStudioConversationUnansweredTaskDecision({ reply: lastReply, declaredTask, message: input.message, context: input.context }), source: "model", modelProblem: null, attempts, ...priced(costUsd, pricedCalls) };
  return { ...fallback(input, problem, attempts), ...priced(costUsd, pricedCalls) };
}

/** The model-access state a failed attempt carried (`AutomationStudioModelAccessError.access`), or null. */
function modelAccessOf(error: unknown): ModelAccessState | null {
  const carried = (error as { access?: unknown } | null)?.access;
  return carried === undefined ? null : readModelAccessState(carried);
}

/**
 * The reading when the model could not be reached for an access reason. As with a missing key, a
 * confident word match (running a saved Flow, which needs no model) still acts; anything else gets the
 * state's own words alone, which name the real reason and what to do.
 */
function accessReading(input: AutomationStudioConversationInterpretInput, access: ModelAccessState, attempts: number): AutomationStudioConversationInterpretation {
  // Said after the action as "(I read your message without the model, because ...)".
  const matched = fallback(input, `the model could not be used: ${access.message.replace(/\.$/u, "")}`, attempts);
  if (matched.decision.kind !== "reply") return { ...matched, modelAccess: access };
  return { decision: { kind: "reply", text: access.message }, source: "closest_match", modelProblem: access.message, keySetup: true, modelAccess: access, attempts };
}

/**
 * One attempt, over at `ms` whether or not the model honours its signal. The
 * signal still tells the model to stop, but the attempt's end is Core's own
 * timer: in A8 wave 4 (t613) a DeepSeek attempt whose timeout signal had fired
 * kept reading a body that never finished, and the turn, with the panel's
 * "Sending your message", waited on it past the Lab's 60 s. Thrown as a
 * `TimeoutError`, which the thread reads as "the model did not answer in time"
 * and which is tried again while the deadline lasts.
 */
async function attemptWithin<T>(ms: number, attempt: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      const reason = new DOMException("The model did not answer in time.", "TimeoutError");
      controller.abort(reason);
      reject(reason);
    }, ms);
  });
  try {
    return await Promise.race([attempt(controller.signal), expired]);
  } finally {
    clearTimeout(timer);
  }
}

/** The interpretation's `costUsd` and `pricedCalls`, present only when an attempt was priced. */
function priced(costUsd: number | undefined, pricedCalls: number): { costUsd?: number; pricedCalls?: number } {
  return costUsd === undefined ? {} : { costUsd, pricedCalls };
}

/** Why a model call failed, in words a person reads in the thread. Never the provider's own message, which is not written for them. */
export function automationStudioConversationModelProblem(error: unknown): string {
  const code = typeof (error as { code?: unknown } | null)?.code === "string" ? (error as { code: string }).code : "";
  const name = error instanceof Error ? error.name : "";
  if (/timeout|aborted/u.test(code) || name === "TimeoutError" || name === "AbortError") return "the model did not answer in time";
  if (/rate_limited/u.test(code)) return "the model was too busy to answer";
  if (/balance_exhausted/u.test(code)) return "the model account's balance has run out, so add credit with the model provider and try again";
  if (/secret_unavailable/u.test(code)) return secretProblem(error instanceof Error ? error.message : "");
  if (/auth|secret/u.test(code)) return "the model's credentials were not accepted";
  if (/network|http|redirect/u.test(code)) return "the model could not be reached";
  // Never the code itself: the thread keeps these words, and shows them again (t276).
  return "the model call failed";
}

/**
 * Why a model key could not be released, from the words the release gave
 * (`models/secrets/session-key.ts`; the adapters keep them). No key at all and
 * a saved key that needs one panel sign-in to be upgraded are different
 * problems with different fixes, and neither claims a key exists when none does.
 */
const NO_KEY = "no model key is set up yet, so add one in Settings, under AI keys";
const NEEDS_SIGN_IN = "the saved model key needs one sign-in to the panel to upgrade it, then try again";

function secretProblem(message: string): string {
  if (/no enabled .* key|no configured model key|no model key/iu.test(message)) return NO_KEY;
  if (/requires recovery|protection key|could not be authenticated/iu.test(message)) return NEEDS_SIGN_IN;
  return "the model key could not be used, so check the model key in FluxIQ and try again";
}

const KEY_SETUP_PROBLEMS = [NO_KEY, NEEDS_SIGN_IN];

function keySetupProblem(problem: string): boolean {
  return KEY_SETUP_PROBLEMS.includes(problem);
}

/** The person's message was not read at all: the one thing to tell them is how to make the model usable. */
function setupReply(problem: string, attempts: number): AutomationStudioConversationInterpretation {
  return { decision: { kind: "reply", text: `${problem.charAt(0).toUpperCase()}${problem.slice(1)}.` }, source: "closest_match", modelProblem: problem, keySetup: true, attempts };
}

function fallback(input: AutomationStudioConversationInterpretInput, problem: string, attempts: number): AutomationStudioConversationInterpretation {
  return { decision: automationStudioConversationFallbackDecision(input.message, input.context), source: "closest_match", modelProblem: problem, attempts };
}
