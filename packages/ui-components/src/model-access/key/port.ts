// How the key card reads and changes the person's AI keys. The client supplies it; the card never knows
// whether a request crossed a browser extension's background or a panel's program API. A key's value is
// sent, never returned, never logged and never kept: not in the DOM, not in storage, not in an answer.

import type { ModelAccessState } from "../state.ts";
import type { ModelKeysResult } from "./result.ts";

/** A new key: the provider's id, an optional name (the card defaults it) and the pasted value. A key needs no password. */
export type ModelKeySave = { provider: string; name?: string; value: string };

/** The model-keys port; `ChatModelsPort` stays the read-only chat port beside it. */
export type ModelKeysPort = {
  /** The key's current state, and its id when it has one (used for Replace, Remove and check). */
  readState(): Promise<ModelKeysResult<{ state: ModelAccessState; keyId?: string }>>;
  /** Adds a key. `keyId` is the new key's id when the host knows it, so the card can ask it to check it. */
  save(request: ModelKeySave): Promise<ModelKeysResult<{ keyId?: string }>>;
  /** Replaces a saved key's value, keeping its name. */
  replace(keyId: string, value: string): Promise<ModelKeysResult>;
  /** Removes a saved key. */
  remove(keyId: string): Promise<ModelKeysResult>;
  /** Asks the provider whether it accepts the key. Absent: the new state is read as it stands. */
  check?(keyId: string): Promise<ModelKeysResult>;
  /** Hears the key change as the host is told of it: a state is drawn at once, `null` means "changed, read again". Returns the unsubscribe. Absent: the card only reads when asked. */
  subscribe?(listener: (state: ModelAccessState | null) => void): () => void;
  /** False where the client only shows the key (the extension): no form, and the one action sends the person to the FluxIQ panel. */
  readonly canWrite: boolean;
};
