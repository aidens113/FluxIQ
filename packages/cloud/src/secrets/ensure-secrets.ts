import { randomBytes, randomUUID } from "node:crypto";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PlannedSecret } from "../plan/index.ts";

/**
 * Makes sure every secret file the deployment mounts exists. A missing file
 * that can be generated (the provisioning token, the setup code, the host
 * keyring, a key for stripe-mock) is written, readable by its owner only; a
 * missing operator file (a real Stripe key, an SMTP password) is an error
 * naming it. A secret is never printed, never put in an env file, and never
 * regenerated once it exists, so data sealed under the keyring stays
 * readable. Answers the files it generated.
 */
export async function ensureSecrets(secrets: readonly PlannedSecret[]): Promise<string[]> {
  const missingOperatorFiles: string[] = [];
  for (const secret of secrets) {
    if (secret.generate === "operator" && !(await exists(secret.file))) missingOperatorFiles.push(secret.file);
  }
  if (missingOperatorFiles.length > 0) throw new Error(`These secret files must be created by the operator before up:\n${missingOperatorFiles.map((file) => `  - ${file}`).join("\n")}`);
  const generated: string[] = [];
  for (const secret of secrets) {
    if (secret.generate === "operator" || (await exists(secret.file))) continue;
    await mkdir(path.dirname(secret.file), { recursive: true, mode: 0o700 });
    await writeFile(secret.file, contentFor(secret.generate), { encoding: "utf8", mode: 0o600, flag: "wx" });
    generated.push(secret.file);
  }
  return generated;
}

function contentFor(kind: Exclude<PlannedSecret["generate"], "operator">): string {
  switch (kind) {
    case "token": return `${randomBytes(32).toString("hex")}\n`;
    case "setup-code": return `${randomBytes(24).toString("hex")}\n`;
    case "stripe-mock-key": return `sk_test_${randomBytes(24).toString("hex")}\n`;
    case "keyring": {
      const keyId = randomUUID();
      return JSON.stringify({ version: 1, currentKeyId: keyId, keys: { [keyId]: randomBytes(32).toString("base64") } });
    }
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}
