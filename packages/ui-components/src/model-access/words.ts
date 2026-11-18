// The fixed words of each model-access state: a badge, one sentence and one action. Every surface that shows
// the state takes its words from here, so they never drift apart.

import type { ModelAccessState } from "./state.ts";

/** What a state's one action does. The card handles the first three itself; the rest go to the host. */
export type ModelAccessActionId = "add-key" | "paste-again" | "replace-key" | "change-model" | "try-now" | "how-to-update";

/** A badge's look: green, amber, red or grey. */
export type ModelAccessTone = "ok" | "warn" | "bad" | "neutral";

/** What the card says for a state. */
export type ModelAccessWords = {
  badge: string;
  tone: ModelAccessTone;
  sentence: string;
  action: { id: ModelAccessActionId; label: string };
};

/** Said while the state is still being read. */
export const MODEL_ACCESS_CHECKING = "Checking your AI key...";

/** The badge, sentence and action for `state`; `nowMs` dates a ready key's last answer. */
export function modelAccessWords(state: ModelAccessState, nowMs: number = Date.now()): ModelAccessWords {
  switch (state.kind) {
    case "ready":
      return { badge: "Ready", tone: "ok", sentence: `${state.provider} is ready, using ${state.keyName}.${lastAnswered(state.lastAnsweredAtMs, nowMs)}`, action: { id: "change-model", label: "Change model" } };
    case "no-key":
      return { badge: "No key", tone: "warn", sentence: state.message ?? "Add an AI key to start. FluxIQ uses it to understand and build what you ask.", action: { id: "add-key", label: state.actionLabel ?? "Add a key" } };
    case "cant-open":
      return { badge: "Can't open", tone: "bad", sentence: state.message ?? `FluxIQ saved ${state.keyName} but can't read it any more. Paste it again to keep going.`, action: { id: "paste-again", label: "Paste it again" } };
    case "not-accepted":
      return { badge: "Not accepted", tone: "bad", sentence: `${state.provider} did not accept ${state.keyName}. Check that it was copied in full.`, action: { id: "replace-key", label: "Replace key" } };
    case "unreachable":
      return { badge: `Can't reach ${state.provider}`, tone: "neutral", sentence: `FluxIQ couldn't reach ${state.provider} just now. It tries again on your next message.`, action: { id: "try-now", label: "Try now" } };
    case "update-fluxiq":
      return { badge: "Update FluxIQ", tone: "neutral", sentence: "This FluxIQ is too old to use your AI key. Update it.", action: { id: "how-to-update", label: "How to update" } };
  }
}

function lastAnswered(atMs: number | undefined, nowMs: number): string {
  if (atMs === undefined || !Number.isFinite(atMs)) return "";
  const minutes = Math.floor(Math.max(0, nowMs - atMs) / 60_000);
  if (minutes < 1) return " It last answered just now.";
  if (minutes < 60) return ` It last answered ${minutes} min ago.`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return ` It last answered ${hours} h ago.`;
  return ` It last answered on ${new Date(atMs).toLocaleDateString(undefined, { day: "numeric", month: "short" })}.`;
}
