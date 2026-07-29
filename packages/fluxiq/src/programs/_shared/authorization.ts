import type { IdentityAccessService } from "../identity-access";

export type ProgramPinAuthorizationPayload = {
  authSessionId?: unknown;
  authorizationPin?: unknown;
};

export async function authorizeProgramPin(identityAccess: IdentityAccessService | undefined, payload: ProgramPinAuthorizationPayload): Promise<void> {
  if (!identityAccess) throw new Error("PIN authorization service is not available.");
  await identityAccess.authorizeSessionPin({
    sessionId: typeof payload.authSessionId === "string" ? payload.authSessionId : undefined,
    pin: typeof payload.authorizationPin === "string" ? payload.authorizationPin : undefined
  });
}
