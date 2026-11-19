"use client";

import { PublishPanelPage } from "../../panel-shell";
import type { CurrentUser } from "../../programs/types";
import { TechnicalDetails } from "../../programs/technical-details";
import { SecretKeysLive } from "../keys/manager";
import "../security.css";

/** `/settings/saved-logins` (Settings > Advanced): the logins and keys Flows use on other sites and services. AI keys are on `/settings#ai-keys`. */
export function SecurityKeysPage(props: { user: CurrentUser }) {
  return (
    <div className="security">
      <PublishPanelPage page="settings" selection={{}} />
      <a className="security-back" href="/settings">Settings</a>
      <h1>Saved logins and keys for Flows</h1>
      <p className="security-note">The logins and keys your Flows use on other sites and services. FluxIQ keeps each one and never shows it again. Your AI key is added in Settings, under <a href="/settings#ai-keys">AI keys</a>.</p>
      <TechnicalDetails toolId="secret-keys" title="Saved logins and keys for Flows" />
      <SecretKeysLive currentUser={props.user} />
    </div>
  );
}
