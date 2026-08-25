const SESSION_BOUND_PROGRAMS = new Set(["identity-access", "database-manager", "automation-studio", "secret-keys"]);

export function programResponseStatus(response: { ok: boolean; errorCode?: string }): number {
  if (response.ok) return 200;
  if (response.errorCode === "authorization.required") return 401;
  if (response.errorCode === "authorization.forbidden") return 403;
  if (response.errorCode === "endpoint.not_found") return 404;
  return 400;
}

export function programDomainScope(requestUrl: string): { domainId: string | null } {
  return { domainId: new URL(requestUrl).searchParams.get("domainId") };
}

export function withProgramAuthSession(programId: string, payload: unknown, sessionId: string): unknown {
  if (!SESSION_BOUND_PROGRAMS.has(programId) || !payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  return { ...payload, authSessionId: sessionId };
}
