// The candidate start hook (decision D1) built from the Core process's
// deployment configuration (`./environment.ts`), for the host that constructs
// the service (`programs/_shared/runtime.ts`).
//
// Unset is the default and the product's configuration: no hook, so readiness
// reports `startReset: false` and every trial records `not_reset`. A half-set
// or malformed configuration refuses when the host starts, rather than
// silently running trials without the reset the deployment asked for.
//
// The hook POSTs an empty JSON object -- the request carries nothing of the
// candidate, so the endpoint can be a plain reset -- and answers the JSON
// object the endpoint returned, which the trial records and never shows the
// model. A refusal, a non-object answer or a timeout throws; the trial then
// records `candidate.trial_start_failed` with the error's kind only.

import type { AutomationStudioPrepareCandidateStart } from "../service/candidate-trial/index.ts";
import { AUTOMATION_STUDIO_CANDIDATE_START_HOOK_ENV as ENV } from "./environment.ts";

type Environment = Readonly<Record<string, string | undefined>>;

/** How long one start may take before the trial records it as failed. */
const START_TIMEOUT_MS = 15_000;
/** The most of the endpoint's answer that is read and recorded. */
const MAX_ANSWER_BYTES = 16 * 1024;

function processEnvironment(): Environment {
  return (globalThis as { process?: { env?: Environment } }).process?.env ?? {};
}

function configured(env: Environment, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

/**
 * The deployment's start hook, or `undefined` when none is configured.
 * Throws, naming the variable, when the configuration is half set or the
 * endpoint is not a plain http(s) address.
 */
export function automationStudioCandidateStartHookFromEnvironment(
  env: Environment = processEnvironment(),
  dependencies: { fetch?: typeof fetch; timeoutMs?: number } = {}
): AutomationStudioPrepareCandidateStart | undefined {
  const endpoint = configured(env, ENV.endpoint), token = configured(env, ENV.token);
  if (endpoint === undefined) {
    if (token !== undefined) throw new Error(`${ENV.token} is set without ${ENV.endpoint}; set both, or neither for no candidate start hook.`);
    return undefined;
  }
  let address: URL;
  try { address = new URL(endpoint); } catch { throw new Error(`${ENV.endpoint} must be an absolute http or https address.`); }
  if ((address.protocol !== "http:" && address.protocol !== "https:") || address.username || address.password) {
    throw new Error(`${ENV.endpoint} must be an absolute http or https address without credentials in it.`);
  }
  const target = address.toString(), send = dependencies.fetch ?? fetch, timeoutMs = dependencies.timeoutMs ?? START_TIMEOUT_MS;
  return async ({ signal }) => {
    const response = await send(target, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", ...(token === undefined ? {} : { authorization: `Bearer ${token}` }) },
      body: "{}",
      signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]),
      redirect: "error"
    });
    if (!response.ok) throw new Error(`The candidate start hook answered HTTP ${response.status}.`);
    const text = await response.text();
    if (text.length > MAX_ANSWER_BYTES) throw new Error("The candidate start hook answered more than it may record.");
    let answer: unknown;
    try { answer = JSON.parse(text); } catch { throw new Error("The candidate start hook answered something other than JSON."); }
    if (!answer || typeof answer !== "object" || Array.isArray(answer)) throw new Error("The candidate start hook answered something other than a JSON object.");
    return answer as Awaited<ReturnType<AutomationStudioPrepareCandidateStart>>;
  };
}
