// The `password` identity provider: a username, a password and, where the
// account has one, an authenticator code, proved by identity-access's own
// `authenticate`. Nothing is added here -- the dummy derivation for an unknown
// account, the TOTP gate and the session minting all stay in the service -- so signing in through the port and through the service are
// the same act.

import type { IdentityAccessService } from "../service.ts";
import type { IdentityProvider } from "./identity-provider.ts";

/** What the password provider takes: the `authenticate` input, without the test-only clock. */
export type PasswordIdentityCredentials = { username: string; password: string; totp?: string; ttlMs?: number };

/** The password provider over an identity service. */
export function createPasswordIdentityProvider(service: Pick<IdentityAccessService, "authenticate">): IdentityProvider<PasswordIdentityCredentials> {
  return {
    id: "password",
    signIn: async (credentials) => await service.authenticate({
      username: credentials.username,
      password: credentials.password,
      ...(credentials.totp === undefined ? {} : { totp: credentials.totp }),
      ...(credentials.ttlMs === undefined ? {} : { ttlMs: credentials.ttlMs })
    })
  };
}
