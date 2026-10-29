// The identity providers port (hosted production plan, Identity And Sessions):
// how a person proves who they are and gets a panel session. `password` is the
// only provider at launch (`password.ts`); `oidc` joins in H2. A provider proves
// the person and returns the session identity-access minted for them; it never
// mints one itself, so every provider ends in the same session, role and
// revocation rules.

import type { Role, Session, User } from "../../types.ts";

/** The providers Core knows: `password` now, `oidc` in H2. */
export type IdentityProviderId = "password" | "oidc";

/** A signed-in person: the session minted for them, their account and their role. */
export type IdentityProviderSignIn = { session: Session; user: User; role: Role };

/** One way of proving a person's identity, taking that provider's own credentials. */
export type IdentityProvider<Credentials> = {
  readonly id: IdentityProviderId;
  /** Proves `credentials` and returns the minted session; throws on any refusal, in the provider's own words. */
  signIn(credentials: Credentials): Promise<IdentityProviderSignIn>;
};
