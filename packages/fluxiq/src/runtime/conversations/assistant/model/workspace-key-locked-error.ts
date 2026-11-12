// The typed `secrets.locked` error as a person is told it when the key that
// would pay for their message is the workspace's, held by someone else
// (`key-model-source.ts`): the workspace's key is locked and its owner must
// unlock it. Same code and type as the holder's own, so every client treats it
// alike; no sign-in link, since the sender's own unlock cannot open it.

import { workspaceKeyLockedMessage } from "@fluxiq/contracts/platform";
import { AutomationStudioSecretsLockedError } from "../../../llm/index.ts";

/** Named in the sentence when the instance did not say where it is, as the holder's own error does. */
const DEFAULT_INSTANCE_HOST = "the FluxIQ panel";

export class PanelAssistantWorkspaceKeyLockedError extends AutomationStudioSecretsLockedError {
  /** `cause` is the holder's own locked error, which names no key value. */
  constructor(options: { instanceHost?: string | undefined; cause?: unknown } = {}) {
    super({ instanceHost: options.instanceHost, cause: options.cause });
    this.name = "PanelAssistantWorkspaceKeyLockedError";
    this.message = workspaceKeyLockedMessage(options.instanceHost?.trim() || DEFAULT_INSTANCE_HOST);
  }
}
