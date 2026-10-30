import { readFile } from "node:fs/promises";
import { ownerClaimPaths } from "../owner-claim-paths";
import { SETUP_CODE_MINIMUM_LENGTH } from "../setup-code-minimum-length";

/**
 * The generated `<fluxiq>/security/setup-code`, trimmed, or null when there
 * is none: no file, or one too short to be a code. Any other read failure
 * propagates.
 */
export async function readGeneratedSetupCode(fluxiqDir: string): Promise<string | null> {
  let text: string;
  try {
    text = await readFile(ownerClaimPaths(fluxiqDir).generatedCode, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const code = text.trim();
  return [...code].length >= SETUP_CODE_MINIMUM_LENGTH ? code : null;
}
