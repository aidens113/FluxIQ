import { AI_PROVIDER_SECRET_KEYS_HREF, deepSeekKeyAvailability } from "../settings";
import type { OnboardingAction, OnboardingReadings, OnboardingStep, OnboardingStepId } from "./types";

type StepCheck = { id: OnboardingStepId; title: string; satisfied: boolean; detail: string; action: OnboardingAction; problem?: string };

const RUNTIME_ACTION: OnboardingAction = { label: "Start the FluxIQ runtime", location: "A terminal in your FluxIQ folder", command: "pnpm dev" };
const PAIRING_ACTION: OnboardingAction = { label: "Pair the browser extension", location: "Open the FluxIQ extension and connect it to this panel, then confirm the matching code in the \"Client pairing request\" prompt that opens here" };
const KEY_ACTION: OnboardingAction = { label: "Add a DeepSeek API key", location: "Secret Keys > Add Key, with kind LLM and provider DeepSeek", href: AI_PROVIDER_SECRET_KEYS_HREF };

/**
 * The first-run checklist, in order: runtime, pairing, DeepSeek key.
 *
 * A step whose own condition holds is `done`. The first step that is not is
 * `current`, and every later unfinished step is `blocked` by it, so exactly
 * one step is ever the next thing to do. A source that could not be read
 * leaves its step unfinished with `problem` set; it is never read as "none".
 * Nothing here reads or returns a pairing code, token, or key value.
 */
export function onboardingSteps(readings: OnboardingReadings, nowMs: number): OnboardingStep[] {
  const checks = [runtimeCheck(readings), pairingCheck(readings, nowMs), keyCheck(readings)];
  let current: OnboardingStepId | null = null;
  return checks.map((check) => {
    const base = { id: check.id, title: check.title, detail: check.detail, action: check.action };
    const withProblem = check.problem ? { ...base, problem: check.problem } : base;
    if (check.satisfied) return { ...withProblem, state: "done" as const };
    if (current === null) {
      current = check.id;
      return { ...withProblem, state: "current" as const };
    }
    return { ...withProblem, state: "blocked" as const, blockedBy: current };
  });
}

function runtimeCheck(readings: OnboardingReadings): StepCheck {
  const step = { id: "runtime" as const, title: "Start the FluxIQ runtime", action: RUNTIME_ACTION };
  const gateway = readings.gateway;
  if (gateway.status === "loading") return { ...step, satisfied: false, detail: "Checking whether the FluxIQ runtime is reachable..." };
  if (gateway.status === "failed") return { ...step, satisfied: false, detail: "The FluxIQ runtime did not answer.", problem: gateway.error };
  if (gateway.value.webRuntime?.clientGatewayListening === true) return { ...step, satisfied: true, detail: "The runtime is running and listening for the browser extension." };
  const gatewayError = gateway.value.webRuntime?.clientGatewayError;
  return gatewayError
    ? { ...step, satisfied: false, detail: "The web panel is running, but the browser gateway is not listening.", problem: gatewayError }
    : { ...step, satisfied: false, detail: "The web panel is running, but the browser gateway is not listening." };
}

function pairingCheck(readings: OnboardingReadings, nowMs: number): StepCheck {
  const step = { id: "pairing" as const, title: "Pair the browser extension", action: PAIRING_ACTION };
  const gateway = readings.gateway;
  if (gateway.status === "loading") return { ...step, satisfied: false, detail: "Checking for a connected browser extension..." };
  if (gateway.status === "failed") return { ...step, satisfied: false, detail: "Connected browsers could not be checked.", problem: gateway.error };
  const sessions = gateway.value.sessions ?? [];
  if (sessions.length) return { ...step, satisfied: true, detail: sessions.length === 1 ? "1 browser extension is connected." : `${sessions.length} browser extensions are connected.` };
  const waiting = (gateway.value.pairings ?? []).some((pairing) => !pairing.consumedAt && Number(pairing.expiresAt ?? 0) > nowMs);
  return { ...step, satisfied: false, detail: waiting ? "A pairing request is waiting. Confirm it in the \"Client pairing request\" prompt." : "No browser extension is connected yet." };
}

function keyCheck(readings: OnboardingReadings): StepCheck {
  const step = { id: "deepseek-key" as const, title: "Add a DeepSeek API key", action: KEY_ACTION };
  const keys = readings.keys;
  const availability = deepSeekKeyAvailability({
    keys: keys.status === "loaded" ? keys.value : null,
    loading: keys.status === "loading",
    error: keys.status === "failed" ? keys.error : ""
  });
  if (keys.status === "failed") return { ...step, satisfied: false, detail: "Your API keys could not be checked.", problem: keys.error };
  return { ...step, satisfied: availability.status === "ready", detail: availability.summary };
}
