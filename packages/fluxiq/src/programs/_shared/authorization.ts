import type { IdentityAccessService } from "../identity-access/index.ts";

export type ProgramPinAuthorizationPayload = {
  authSessionId?: unknown;
  authorizationPin?: unknown;
};

export function programAuthorizationPinError(pin: unknown): string | null {
  if (typeof pin !== "string" || !pin.length) return "PIN is required for this action";
  if (!/^\d{4,12}$/.test(pin)) return "PIN must contain 4 to 12 digits";
  return null;
}

export async function authorizeProgramPin(identityAccess: IdentityAccessService | undefined, payload: ProgramPinAuthorizationPayload): Promise<void> {
  if (!identityAccess) throw new Error("PIN authorization service is not available.");
  const pinError = programAuthorizationPinError(payload.authorizationPin);
  if (pinError) throw new Error(pinError);
  await identityAccess.authorizeSessionPin({
    sessionId: typeof payload.authSessionId === "string" ? payload.authSessionId : undefined,
    pin: typeof payload.authorizationPin === "string" ? payload.authorizationPin : undefined
  });
}
