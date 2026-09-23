// What resolving a standing check's model reaches outside itself.
//
// Structural rather than the Secret Keys class, for the reason
// `recovery/annotation/ports.ts` gives about the service: a path that can only
// be driven by standing up a whole program is a path nobody writes an assertion
// about. Here it also keeps this directory from depending on another program at
// all -- the host passes its Secret Keys service, and a test passes four
// functions.

import type { AutomationStudioLlmProvider } from "../llm/index.ts";

/** The Secret Keys operations a standing check needs, and no others. */
export type AutomationStudioResultCheckProviderPorts = {
  getKeySummary(id: string): Promise<{ id: string; kind: string; enabled: boolean; updatedAtMs: number } | null | undefined>;
  /** Mints a one-use reveal from the person's held key unlock. Refuses unless the unlock is live and belongs to that user. */
  createSessionRevealAuthorization(input: { id: string; sessionId: string; userId: string; ttlMs: number }): Promise<{ authorizationId: string; keyId: string; keyUpdatedAtMs: number }>;
  revealKeyWithAuthorization(input: { authorizationId: string; id: string }): Promise<{ value: string }>;
  revokeRevealAuthorization(authorizationId: string): void;
};

/** The model a standing check resolved to, with the ceiling the redemption worked out. */
export type AutomationStudioResultCheckProviderResolution = {
  provider: AutomationStudioLlmProvider;
  maxEstimatedCostUsd: number;
};

/** The one Flow, one key and one call ceiling this resolution is bound to. */
export type AutomationStudioResultCheckProviderScope = {
  projectId: string;
  flowId: string;
  keyId: string;
  unlockSessionId: string;
  authorizedByUserId: string;
  maxEstimatedCostUsd: number;
};
