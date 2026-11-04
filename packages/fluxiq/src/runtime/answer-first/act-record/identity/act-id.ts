// An act's id across build, trial and run (`design.md`): `act.` and a digest of its
// action, its target's identity and its row's. Never a position or a handle, unless a
// handle is all that was ever known of the target.

import { automationStudioAttemptActDigest } from "./digest.ts";

/** Long enough never to meet another act of one attempt; the contract's id pattern holds it. */
const ID_DIGEST_LENGTH = 40;

/** The id of the act that answers to `key`, on `row` when it is per row. */
export function automationStudioAttemptActId(input: { key: string; row?: string | undefined }): string {
  return `act.${automationStudioAttemptActDigest({ key: input.key, row: input.row ?? null }).slice(0, ID_DIGEST_LENGTH)}`;
}
