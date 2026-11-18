// What resolving a standing check's model reaches outside itself.
//
// Structural rather than the Secret Keys class, for the reason
// `recovery/annotation/ports.ts` gives about the service: a path that can only
// be driven by standing up a whole program is a path nobody writes an assertion
// about. Here it also keeps this directory from depending on another program at
// all -- the host passes its Secret Keys service, and a test passes four
// functions.

import type { AutomationStudioLlmProvider } from "../../llm/index.ts";

/** What a standing authorization's use is paid for: judging a result, or repairing the Flow. */
export type AutomationStudioResultCheckUsePurpose = "loop_verification" | "repair";

/**
 * The principal a standing authorization's use is authorized as. The same
 * shape as Secret Keys' `standing` principal: the key's authority finds the
 * stored grant by `authorizationId` on this Flow and re-checks the person, the
 * client they granted it through, the key and IAM at every use.
 */
export type AutomationStudioResultCheckUsePrincipal = {
  kind: "standing";
  userId: string;
  authorizationId: string;
  projectId: string;
  flowId: string;
  purpose: AutomationStudioResultCheckUsePurpose;
};

/** The Secret Keys operations a standing check needs, and no others. */
export type AutomationStudioResultCheckProviderPorts = {
  getKeySummary(id: string): Promise<{ id: string; kind: string; enabled: boolean; updatedAtMs: number; provider?: string | undefined; metadata?: { model?: unknown } | undefined } | null | undefined>;
  /** Mints a one-use authorization for this principal. Refuses unless the key's per-use authority allows it now. No session or unlock is involved. */
  createUseAuthorization(input: { id: string; principal: AutomationStudioResultCheckUsePrincipal; ttlMs: number }): Promise<{ authorizationId: string; keyId: string; keyUpdatedAtMs: number }>;
  revealKeyWithAuthorization(input: { authorizationId: string; id: string }): Promise<{ value: string }>;
  revokeRevealAuthorization(authorizationId: string): void;
};

/** The model a standing check resolved to, with the ceiling the redemption worked out. */
export type AutomationStudioResultCheckProviderResolution = {
  provider: AutomationStudioLlmProvider;
  maxEstimatedCostUsd: number;
};

/** The one Flow, one key, one grant and one call ceiling this resolution is bound to. */
export type AutomationStudioResultCheckProviderScope = {
  projectId: string;
  flowId: string;
  keyId: string;
  providerId?: string;
  modelId?: string;
  /** The stored grant each use is authorized under. */
  authorizationId: string;
  authorizedByUserId: string;
  purpose: AutomationStudioResultCheckUsePurpose;
  maxEstimatedCostUsd: number;
};
