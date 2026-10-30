import { randomBytes } from "node:crypto";
import { rm } from "node:fs/promises";
import { ownerClaimPaths } from "./owner-claim-paths";
import { readConfiguredSetupCode, readGeneratedSetupCode, readOwnerClaimMarker } from "./read";
import type { PrepareOwnerClaimInput, PrepareOwnerClaimResult } from "./types";
import { writePrivateFile } from "./write-private-file";

/** 20 random bytes, 160 bits, as 40 hex characters. */
const GENERATED_CODE_BYTES = 20;

/**
 * Run at start on `self-hosted` and `service` (`lib/fluxiq.ts`), which logs
 * `codeFile` and never the code.
 *
 * - Claimed (the marker exists): a generated code file left behind is removed.
 * - `FLUXIQ_SETUP_CODE_FILE` set: its trimmed content is the code; under 16
 *   characters, or unreadable, it throws (the server must not start with a
 *   guessable claim). The operator's file is never written or removed.
 * - Otherwise: `<fluxiq>/security/setup-code`, kept across restarts while it
 *   holds a usable code, else a new 160-bit code written mode 0600.
 *
 * On `local` it does nothing: the first loopback start keeps today's
 * admin/admin and has no setup code.
 */
export async function prepareOwnerClaim(input: PrepareOwnerClaimInput): Promise<PrepareOwnerClaimResult> {
  const paths = ownerClaimPaths(input.fluxiqDir);
  const claimed = (await readOwnerClaimMarker(input.fluxiqDir)) !== null;
  if (input.settings.profile === "local") return { claimed, codeFile: null };
  if (claimed) {
    await rm(paths.generatedCode, { force: true });
    return { claimed: true, codeFile: null };
  }
  if (input.settings.setupCodeFile !== null) {
    await readConfiguredSetupCode(input.settings.setupCodeFile);
    return { claimed: false, codeFile: input.settings.setupCodeFile };
  }
  if ((await readGeneratedSetupCode(input.fluxiqDir)) === null) {
    await writePrivateFile(paths.generatedCode, `${randomBytes(GENERATED_CODE_BYTES).toString("hex")}\n`);
  }
  return { claimed: false, codeFile: paths.generatedCode };
}
