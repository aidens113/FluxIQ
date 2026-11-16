// Turning a person's "check this Flow's results" into the stored grant.
//
// Pure. The caller (`flow-settings-requests/stored-check-authorization.ts`)
// says who is asking, from the request's own authenticated actor and never
// from its body, and mints `authorizationId`; this reads the person's choices
// and writes the one record every later use is authorized under.
//
// The grantor is the authenticated caller: the person signed in to the panel,
// or a client paired for them, which may authorize a result check for its
// person exactly as it may make any other model call for them (user,
// 2026-11-16). Whose key it names is the caller's own choice, and the key's
// per-use authority refuses at every use a key that person may not use.

import { AUTOMATION_STUDIO_RESULT_CHECK_AUTHORIZATION_DEFAULTS, AUTOMATION_STUDIO_RESULT_CHECK_TASK_KIND, type AutomationStudioResultCheckAuthorization, type AutomationStudioResultCheckGrantor } from "./contracts.ts";

/** What a person chooses when turning result checking on. Only the key is required; the limits default. */
export type AutomationStudioResultCheckGrantRequest = {
  keyId: string;
  /** The person's whole budget for checking (and repairing) this Flow until they renew. */
  maxTotalCostUsd?: number;
  maxCostUsdPerCall?: number;
  /** How long until checking stops and the person renews. */
  ttlMs?: number;
  repair?: { enabled: boolean; maxCostUsdPerRun?: number };
};

/**
 * Reads a request's `resultCheckAuthorization`: `undefined` when it asks for
 * nothing, `null` to withdraw the stored grant, or the grant's choices. Throws
 * on anything malformed, so a mistyped limit is an error and not a default.
 */
export function automationStudioResultCheckGrantRequestOf(value: unknown): AutomationStudioResultCheckGrantRequest | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) throw new TypeError("resultCheckAuthorization must be an object, or null to withdraw it.");
  const stated = value as Record<string, unknown>;
  const keyId = typeof stated.keyId === "string" ? stated.keyId.trim() : "";
  if (!keyId) throw new TypeError("resultCheckAuthorization.keyId must name a model key.");
  const amount = (field: string): number | undefined => {
    const given = stated[field];
    if (given === undefined) return undefined;
    if (typeof given !== "number" || !Number.isFinite(given) || given <= 0) throw new TypeError(`resultCheckAuthorization.${field} must be a positive number.`);
    return given;
  };
  const maxTotalCostUsd = amount("maxTotalCostUsd");
  const maxCostUsdPerCall = amount("maxCostUsdPerCall");
  const ttlMs = amount("ttlMs");
  if (ttlMs !== undefined && !Number.isSafeInteger(ttlMs)) throw new TypeError("resultCheckAuthorization.ttlMs must be a whole number of milliseconds.");
  let repair: AutomationStudioResultCheckGrantRequest["repair"];
  if (stated.repair !== undefined) {
    const clause = stated.repair;
    if (!clause || typeof clause !== "object" || Array.isArray(clause) || typeof (clause as Record<string, unknown>).enabled !== "boolean") throw new TypeError("resultCheckAuthorization.repair must say whether it is enabled.");
    const ceiling = (clause as Record<string, unknown>).maxCostUsdPerRun;
    if (ceiling !== undefined && (typeof ceiling !== "number" || !Number.isFinite(ceiling) || ceiling <= 0)) throw new TypeError("resultCheckAuthorization.repair.maxCostUsdPerRun must be a positive number.");
    repair = { enabled: (clause as Record<string, unknown>).enabled as boolean, ...(ceiling === undefined ? {} : { maxCostUsdPerRun: ceiling as number }) };
  }
  return { keyId, ...(maxTotalCostUsd === undefined ? {} : { maxTotalCostUsd }), ...(maxCostUsdPerCall === undefined ? {} : { maxCostUsdPerCall }), ...(ttlMs === undefined ? {} : { ttlMs }), ...(repair ? { repair } : {}) };
}

/** The stored grant for an authenticated caller's request. */
export function grantAutomationStudioResultCheckAuthorization(input: {
  authorizationId: string;
  userId: string;
  grantedThrough: AutomationStudioResultCheckGrantor;
  request: AutomationStudioResultCheckGrantRequest;
  nowMs: number;
}): AutomationStudioResultCheckAuthorization {
  const defaults = AUTOMATION_STUDIO_RESULT_CHECK_AUTHORIZATION_DEFAULTS;
  const maxTotalCostUsd = input.request.maxTotalCostUsd ?? defaults.maxTotalCostUsd;
  const maxCostUsdPerCall = input.request.maxCostUsdPerCall ?? Math.min(defaults.maxCostUsdPerCall, maxTotalCostUsd);
  if (maxCostUsdPerCall > maxTotalCostUsd) throw new TypeError("The most one check may cost cannot be more than the whole budget.");
  if (!input.authorizationId || !input.userId) throw new TypeError("A result-check grant needs an authenticated person.");
  if (input.grantedThrough.kind === "client" && !input.grantedThrough.trustedClientId) throw new TypeError("A client's result-check grant must name the paired client.");
  const repair = input.request.repair?.enabled ? { enabled: true, maxCostUsdPerRun: input.request.repair.maxCostUsdPerRun ?? defaults.repairMaxCostUsdPerRun } : undefined;
  return {
    taskKind: AUTOMATION_STUDIO_RESULT_CHECK_TASK_KIND,
    authorizationId: input.authorizationId,
    authorizedByUserId: input.userId,
    grantedThrough: input.grantedThrough.kind === "client" ? { kind: "client", trustedClientId: input.grantedThrough.trustedClientId } : { kind: "person" },
    keyId: input.request.keyId,
    maxTotalCostUsd,
    maxCostUsdPerCall,
    grantedAtMs: input.nowMs,
    expiresAtMs: input.nowMs + (input.request.ttlMs ?? defaults.ttlMs),
    ...(repair ? { repair } : {})
  };
}
