import type { SecretKeyCredentialUnlockRecord } from "../../../types.ts";
import { SecretKeysService } from "../../service.ts";
import { createMemoryRepository, WEAK_SCRYPT_PARAMETERS } from "../../tests/secret-key-fixtures.ts";
import { secretKeySessionDigest, type SecretKeyLockedCredentialHolder } from "../index.ts";

/** Synthetic, provider-free holder and persistence whose next write can be held or rejected. */
export function strictEnrollmentFixture() {
  const keys = createMemoryRepository();
  const unlocks = createMemoryRepository();
  const clock = { now: 1_000_000 };
  const credential = "synthetic-unpublished-client-credential";
  const holder: SecretKeyLockedCredentialHolder = {
    holderKind: "paired-client",
    holderId: "paired-client:synthetic-enrollment",
    userId: "user.synthetic",
    expiresAtMs: clock.now + 1_000_000,
    approvingSessionDigest: secretKeySessionDigest("synthetic-approving-session"),
    label: "Synthetic client"
  };
  function boot() {
    return new SecretKeysService({ repository: keys.repository, credentialUnlockRepository: unlocks.repository, now: () => clock.now, passwordKdf: { testOnlyWeakParameters: WEAK_SCRYPT_PARAMETERS }, vouchForHolder: () => true });
  }
  const service = boot();
  function stored(): SecretKeyCredentialUnlockRecord | undefined {
    return unlocks.stored(holder.holderId) as unknown as SecretKeyCredentialUnlockRecord | undefined;
  }
  return { keys, unlocks, clock, credential, holder, service, boot, stored };
}
