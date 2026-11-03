// The one typed error a model call made for a person raises when their key is
// locked (hosted production plan, Model Calls; H0-S5): no live unlock of theirs
// in this workspace holds the key the call needs -- after a restart, an
// eviction, a sign-out or an administrator's session revoke. It replaces the
// raw "Secret key session unlock is unavailable" on every release path
// (`session-key.ts`), before a build and mid-build alike, and carries the
// contract's `secrets.locked` code so a client can offer to re-unlock rather
// than read a sentence.

import { SECRETS_LOCKED_ERROR_CODE, secretsLockedMessage, type SecretsLockedError } from "@fluxiq/contracts/platform";

/** The host named in the sentence when the instance did not say which it is. */
const DEFAULT_INSTANCE_HOST = "the FluxIQ panel";

export class AutomationStudioSecretsLockedError extends Error implements SecretsLockedError {
  readonly code: typeof SECRETS_LOCKED_ERROR_CODE = SECRETS_LOCKED_ERROR_CODE;
  readonly signInUrl?: string;

  /**
   * `instanceHost` names where the person signs in ("app.getfluxiq.com");
   * `cause` is the last refusal Secret Keys gave, which names no key value.
   */
  constructor(options: { instanceHost?: string | undefined; signInUrl?: string | undefined; cause?: unknown } = {}) {
    super(secretsLockedMessage(options.instanceHost?.trim() || DEFAULT_INSTANCE_HOST), options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "AutomationStudioSecretsLockedError";
    if (options.signInUrl) this.signInUrl = options.signInUrl;
  }
}
