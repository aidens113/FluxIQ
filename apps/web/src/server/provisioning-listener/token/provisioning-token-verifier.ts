import { createHash, timingSafeEqual } from "node:crypto";
import { stat } from "node:fs/promises";
import { ProvisioningListenerConfigError } from "../provisioning-listener-config-error";
import { readTokenDigests } from "./read-token-digests";

/** How often, at most, the token file's modification time is checked. */
export const TOKEN_FILE_RECHECK_MS = 5_000;

export type ProvisioningTokenVerifierOptions = {
  now: () => number;
  warn: (line: string) => void;
};

/**
 * Checks a presented Bearer token against the token file's digests with
 * `timingSafeEqual`, keeping only SHA-256 digests in memory. The file is
 * re-read when its modification time or size changes, checked at most every
 * five seconds on a request, so rotation (write both tokens, move the caller,
 * write the new one alone) needs no restart. A reload that fails refuses
 * every token until the file is valid again: it fails closed.
 */
export class ProvisioningTokenVerifier {
  private digests: readonly Buffer[];
  private stamp: string | null;
  private checkedAtMs: number;
  private reloading: Promise<void> | null = null;

  private constructor(
    private readonly path: string,
    private readonly options: ProvisioningTokenVerifierOptions,
    initial: { digests: readonly Buffer[]; stamp: string }
  ) {
    this.digests = initial.digests;
    this.stamp = initial.stamp;
    this.checkedAtMs = options.now();
  }

  /** Reads the file once; throws (with no token in the message) when it is unusable. */
  static async open(path: string, options: ProvisioningTokenVerifierOptions): Promise<ProvisioningTokenVerifier> {
    const stamp = await fileStamp(path);
    const digests = await readTokenDigests(path);
    return new ProvisioningTokenVerifier(path, options, { digests, stamp });
  }

  async verify(presented: string): Promise<boolean> {
    await this.refresh();
    const digest = createHash("sha256").update(presented, "utf8").digest();
    let matched = false;
    for (const known of this.digests) {
      if (timingSafeEqual(known, digest)) matched = true;
    }
    return matched;
  }

  private async refresh(): Promise<void> {
    if (this.reloading !== null) {
      await this.reloading;
      return;
    }
    if (this.options.now() - this.checkedAtMs < TOKEN_FILE_RECHECK_MS) return;
    this.checkedAtMs = this.options.now();
    this.reloading = this.reload().finally(() => {
      this.reloading = null;
    });
    await this.reloading;
  }

  private async reload(): Promise<void> {
    try {
      const stamp = await fileStamp(this.path);
      if (stamp === this.stamp) return;
      this.digests = await readTokenDigests(this.path);
      this.stamp = stamp;
    } catch (error) {
      // Fail closed and say so; the next check reads the file again.
      this.digests = [];
      this.stamp = null;
      const reason = error instanceof ProvisioningListenerConfigError ? error.message : "The provisioning token file could not be read.";
      this.options.warn(`[FluxIQ] ${reason} Every provisioning request is refused until the file holds valid tokens.`);
    }
  }
}

async function fileStamp(path: string): Promise<string> {
  try {
    const stats = await stat(path);
    return `${stats.mtimeMs}:${stats.size}`;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | null)?.code ?? "unknown error";
    throw new ProvisioningListenerConfigError(`The provisioning token file (FLUXIQ_PROVISIONING_TOKEN_FILE) could not be read (${code}).`);
  }
}
