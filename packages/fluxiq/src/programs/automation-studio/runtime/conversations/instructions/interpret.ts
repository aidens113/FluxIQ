// Reading a person's message: ask the model, retry what is worth retrying, and
// never come back empty-handed.
//
// The model call is the part that can fail -- a timeout, a rate limit, a
// network blip, an answer that is not the shape it was asked for -- and none of
// those is a reason for a person's message to go unanswered. So:
//
// - A thrown call is tried again, up to three attempts inside one deadline,
//   with a short backoff. A failure the provider marks `retryable: false` (a
//   refused credential, a request it will never accept) is not retried,
//   because trying again would only make the person wait for the same answer.
// - An answer that tried to be an object and could not be read is asked for
//   again with the reason, which a model almost always corrects.
// - When the model cannot be used at all -- none is connected, or every attempt
//   failed -- Core reads the words itself (`fallback.ts`) and records why, so
//   the thread can say so in plain English.

import type { AutomationStudioConversationInterpretation } from "./decision.ts";
import { automationStudioConversationFallbackDecision } from "./fallback.ts";
import type { AutomationStudioConversationDecisionContext } from "./invocation.ts";
import type { AutomationStudioConversationCaller, AutomationStudioConversationModel, AutomationStudioConversationModelTurn } from "./model.ts";
import { parseAutomationStudioConversationDecision } from "./parse.ts";
import { automationStudioConversationInstructions } from "./prompt.ts";

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

  const instructions = automationStudioConversationInstructions(input.context, { transcriptWithheld: input.transcriptWithheld });
  const started = clock.now();
  let correction: string | null = null;
  let problem = "the model did not answer";
  let attempts = 0;
  // What the attempts were priced at, summed; undefined until one is.
  let costUsd: number | undefined;
  const paid = (usd: number) => { if (Number.isFinite(usd) && usd >= 0) costUsd = (costUsd ?? 0) + usd; };
  while (attempts < limits.attempts) {
    const remaining = limits.deadlineMs - (clock.now() - started);
    if (remaining <= 0) {
      problem = "the model did not answer in time";
      break;
    }
    attempts += 1;
    try {
      const raw = await input.model.decide(
        { instructions, transcript: [...input.transcript], message: input.message, correction },
        { signal: AbortSignal.timeout(Math.min(limits.attemptTimeoutMs, remaining)), caller: input.caller ?? null, paid }
      );
      const decision = parseAutomationStudioConversationDecision(raw, input.context);
      if (decision) return { decision, source: "model", modelProblem: null, attempts, ...priced(costUsd) };
      correction = UNREADABLE;
      problem = "the model's answer could not be read";
    } catch (error) {
      problem = automationStudioConversationModelProblem(error);
      if ((error as { retryable?: unknown } | null)?.retryable === false) break;
      await clock.wait(Math.min(limits.backoffMs * 2 ** (attempts - 1), Math.max(0, limits.deadlineMs - (clock.now() - started))));
    }
  }
  return { ...fallback(input, problem, attempts), ...priced(costUsd) };
}

/** The interpretation's `costUsd`, present only when an attempt was priced. */
function priced(costUsd: number | undefined): { costUsd?: number } {
  return costUsd === undefined ? {} : { costUsd };
}

/** Why a model call failed, in words a person reads in the thread. Never the provider's own message, which is not written for them. */
export function automationStudioConversationModelProblem(error: unknown): string {
  const code = typeof (error as { code?: unknown } | null)?.code === "string" ? (error as { code: string }).code : "";
  const name = error instanceof Error ? error.name : "";
  if (/timeout|aborted/u.test(code) || name === "TimeoutError" || name === "AbortError") return "the model did not answer in time";
  if (/rate_limited/u.test(code)) return "the model was too busy to answer";
  if (/secret_unavailable/u.test(code)) return "your model key is locked for this session, so unlock your keys to let the model read your messages";
  if (/auth|secret/u.test(code)) return "the model's credentials were not accepted";
  if (/network|http|redirect/u.test(code)) return "the model could not be reached";
  return code ? `the model call failed (${code})` : "the model call failed";
}

function fallback(input: AutomationStudioConversationInterpretInput, problem: string, attempts: number): AutomationStudioConversationInterpretation {
  return { decision: automationStudioConversationFallbackDecision(input.message, input.context), source: "closest_match", modelProblem: problem, attempts };
}
