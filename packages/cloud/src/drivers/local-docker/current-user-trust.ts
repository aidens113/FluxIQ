import { createHash } from "node:crypto";
import type { CommandRunner } from "../../command/index.ts";

/**
 * The opt-in local trust (`tls.trustLocalCa`): Caddy's local root certificate
 * in the current Windows user's Root store, never the machine's. `certutil
 * -user` is the current user's store; Windows asks the person to confirm the
 * addition. Removal is by the certificate's SHA-1 thumbprint, recorded when
 * it was added, so only that certificate is ever removed.
 */
export const currentUserTrust = {
  thumbprint(pem: string): string {
    const body = pem.replace(/-----(BEGIN|END) CERTIFICATE-----/gu, "").replace(/\s+/gu, "");
    return createHash("sha1").update(Buffer.from(body, "base64")).digest("hex").toUpperCase();
  },

  async add(runner: CommandRunner, platform: NodeJS.Platform, file: string): Promise<void> {
    if (platform !== "win32") throw new Error("tls.trustLocalCa is supported on Windows only for now; turn it off and pin the exported certificate instead.");
    const result = await runner.run("certutil", { args: ["-user", "-addstore", "-f", "Root", file] });
    if (result.code !== 0) throw new Error(`Adding the local certificate authority to the current user's trust store failed (certutil exited ${result.code}).`);
  },

  /** Removes the certificate; one that is already gone is not an error. Answers whether certutil succeeded. */
  async remove(runner: CommandRunner, thumbprint: string): Promise<boolean> {
    const result = await runner.run("certutil", { args: ["-user", "-delstore", "Root", thumbprint] });
    return result.code === 0;
  }
};
