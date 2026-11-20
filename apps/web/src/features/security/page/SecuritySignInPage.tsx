"use client";

import type { CurrentUser } from "../../programs/types";
import { YourSignIn } from "../sign-in";
import { SecurityTabPage } from "./SecurityTabPage";

/** `/security/sign-in`: the person's own name, password, two-step sign-in and Sign out. */
export function SecuritySignInPage(props: { user: CurrentUser & { username?: string | undefined } }) {
  return (
    <SecurityTabPage active="sign-in">
      <YourSignIn user={props.user} />
    </SecurityTabPage>
  );
}
