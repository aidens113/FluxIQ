"use client";

import type { CurrentUser } from "../../programs/types";
import { TechnicalDetails } from "../../programs/technical-details";
import { IdentityAccessLive } from "../sign-in";
import { SecuritySubPage } from "./SecuritySubPage";

/** `/security/advanced`: the users, roles and sign-in rules console, for whoever manages access. */
export function SecurityAdvancedPage(props: { user: CurrentUser & { username?: string | undefined } }) {
  return (
    <SecuritySubPage title="Advanced access controls" note="Users, roles and sign-in rules. Most people never need this page.">
      <TechnicalDetails toolId="identity-access" title="Advanced access controls" />
      <IdentityAccessLive currentUser={props.user} />
    </SecuritySubPage>
  );
}
