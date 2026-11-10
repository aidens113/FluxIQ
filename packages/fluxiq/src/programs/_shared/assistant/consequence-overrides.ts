import type { AssistantConsequence } from "@fluxiq/contracts/program-api-inputs";

/**
 * Endpoints whose assistant consequence the derivation rules get wrong, keyed
 * `<programId>/<endpoint>`. This is the one overrides table; an explicit
 * `consequence` on a registration's `assistant` declaration still wins.
 *
 * - The runs are `per-call`: what a run does is what its Flow does, so the
 *   class comes from the target Flow (`assistantRunConsequences`).
 * - `revoke-client-trust` is `authoring` (revoking must never wait behind a
 *   prompt) but it changes who may act, so it is `security`.
 */
export const ASSISTANT_CONSEQUENCE_OVERRIDES: Readonly<Record<string, AssistantConsequence | "per-call">> = Object.freeze({
  "automation-studio/start-runtime-session": "per-call",
  "automation-studio/run-runtime-session": "per-call",
  "automation-studio/run-task-again": "per-call",
  "automation-studio/run-project-part": "per-call",
  "automation-studio/resume-runtime-session": "per-call",
  "automation-studio/revoke-client-trust": "security"
});
