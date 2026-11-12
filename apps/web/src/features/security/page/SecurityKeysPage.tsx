"use client";

import type { CurrentUser } from "../../programs/types";
import { TechnicalDetails } from "../../programs/technical-details";
import { SecretKeysLive } from "../keys/manager";
import { SecuritySubPage } from "./SecuritySubPage";

/** `/security/keys`: every stored key, managed as the Secret Keys page did, with the same confirmations. */
export function SecurityKeysPage(props: { user: CurrentUser }) {
  return (
    <SecuritySubPage title="Keys" note="Every stored key, for AI and for anything else: add, replace, remove, scope, lock and unlock. A value shows only when you reveal it, for 30 seconds.">
      <TechnicalDetails toolId="secret-keys" title="Keys" />
      <SecretKeysLive currentUser={props.user} />
    </SecuritySubPage>
  );
}
