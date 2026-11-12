"use client";

import type { CurrentUser } from "../../programs/types";
import { TechnicalDetails } from "../../programs/technical-details";
import { IdentityAccessLive } from "../sign-in";
import { SecuritySubPage } from "./SecuritySubPage";

/** `/security/sign-in`: your password, PIN, two-factor, sessions and the credential vault. */
export function SecuritySignInPage(props: { user: CurrentUser & { username?: string | undefined } }) {
  return (
    <SecuritySubPage title="Your sign-in" note="Your password, PIN and two-factor sign-in, your sessions, and the credential vault.">
      <TechnicalDetails toolId="identity-access" title="Your sign-in" />
      <IdentityAccessLive currentUser={props.user} />
    </SecuritySubPage>
  );
}
