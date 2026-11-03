import type { SecretKeysService } from "../../service.ts";
import type { HeldKeys } from "../../held-keys.ts";
import type { SecretKeyStore } from "../../key-store.ts";
import type { SecretValueSealer } from "../../value-sealer.ts";

/** Actual original capability owners; no execution context is stored on a shared receiver. */
export interface SecretKeysOperationContext {
  readonly original: SecretKeysService;
  readonly store: SecretKeyStore;
  readonly heldKeys: HeldKeys;
  readonly sealer: SecretValueSealer;
  readonly now: () => number;
}
