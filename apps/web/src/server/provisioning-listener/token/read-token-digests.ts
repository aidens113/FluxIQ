import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { ProvisioningListenerConfigError } from "../provisioning-listener-config-error";

/** The fewest bytes a provisioning token may carry. */
export const MIN_PROVISIONING_TOKEN_BYTES = 32;

const MAX_TOKENS = 2;

/**
 * Reads the token file (one or two tokens, one per line, blank lines and
 * surrounding space ignored, as `fluxiq accounts` reads it) and returns each
 * token's SHA-256 digest; the tokens themselves are not kept. Throws when the
 * file cannot be read, holds no token or more than two, or a token is shorter
 * than 32 bytes. No message holds a token.
 */
export async function readTokenDigests(path: string): Promise<Buffer[]> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | null)?.code ?? "unknown error";
    throw new ProvisioningListenerConfigError(`The provisioning token file (FLUXIQ_PROVISIONING_TOKEN_FILE) could not be read (${code}).`);
  }
  const tokens = text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (tokens.length === 0) throw new ProvisioningListenerConfigError("The provisioning token file holds no token.");
  if (tokens.length > MAX_TOKENS) throw new ProvisioningListenerConfigError(`The provisioning token file holds ${tokens.length} tokens; it holds one, or two while a token is rotated.`);
  if (tokens.some((token) => Buffer.byteLength(token, "utf8") < MIN_PROVISIONING_TOKEN_BYTES)) {
    throw new ProvisioningListenerConfigError(`A token in the provisioning token file is shorter than ${MIN_PROVISIONING_TOKEN_BYTES} bytes.`);
  }
  return tokens.map((token) => createHash("sha256").update(token, "utf8").digest());
}
