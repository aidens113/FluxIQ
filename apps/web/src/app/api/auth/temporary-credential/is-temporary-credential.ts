import { TEMPORARY_CREDENTIAL } from "./temporary-credential";

/** True when a sign-in that identity access accepted was the default account on its temporary password. */
export function isTemporaryCredential(userId: string, password: string): boolean {
  return userId === TEMPORARY_CREDENTIAL.userId && password === TEMPORARY_CREDENTIAL.password;
}
