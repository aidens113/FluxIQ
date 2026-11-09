// `fluxiq init`: creates ~/.fluxiq (or FLUXIQ_CONFIG_DIR) with an owner key pair and a
// `[default]` profile. Nothing is written into the project and nothing secret is
// printed. Running it again changes nothing that exists.

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fluxiqConfigDir, fluxiqKeysDir, generateKeyPair, loadPrivateKeyFile, parseIni } from "../keys/index.ts";
import type { CliIo } from "./cli-io.ts";
import { restrictToOwner } from "./restrict-to-owner.ts";

const PROFILE_HEADER = "# FluxIQ credentials. This file holds no secret: a profile names the key file under keys/.\n";

function profileText(keyFile: string): string {
  return `[default]\nendpoint = local\nkey_file = ${keyFile}\n`;
}

/** Creates the credentials layout and the owner key. Returns the exit code. */
export function initCommand(io: CliIo): number {
  const directory = fluxiqConfigDir(io.env);
  const keysDirectory = fluxiqKeysDir(io.env);
  const keyFile = path.join(keysDirectory, "owner.pem");
  const publicFile = path.join(keysDirectory, "owner.pub");
  const credentials = path.join(directory, "credentials");
  const warnings: string[] = [];
  mkdirSync(keysDirectory, { recursive: true, mode: 0o700 });
  for (const folder of [directory, keysDirectory]) {
    const warning = restrictToOwner(folder, "directory");
    if (warning !== undefined) warnings.push(warning);
  }
  let created = false;
  if (!existsSync(keyFile)) {
    const pair = generateKeyPair();
    writeFileSync(keyFile, pair.privateKeyPem, { mode: 0o600, flag: "wx" });
    const warning = restrictToOwner(keyFile, "file");
    if (warning !== undefined) warnings.push(warning);
    writeFileSync(publicFile, pair.publicKeyPem, { mode: 0o644 });
    created = true;
  }
  const hasProfile = existsSync(credentials) && parseIni(readFileSync(credentials, "utf8")).default !== undefined;
  if (!hasProfile) {
    if (existsSync(credentials)) appendFileSync(credentials, `\n${profileText(keyFile)}`);
    else writeFileSync(credentials, `${PROFILE_HEADER}${profileText(keyFile)}`, { mode: 0o644 });
  }
  const key = loadPrivateKeyFile(keyFile, "the owner key");
  io.out(`${created ? "Created" : "Found"} your owner key ${key.keyId}\n`);
  io.out(`  private key  ${keyFile}  (stays on this computer, readable by you only)\n`);
  io.out(`  public key   ${publicFile}\n`);
  io.out(`  profile      [default] in ${credentials}\n`);
  io.out("Nothing was written into this project. Programs find the key themselves: FluxIQ.connect() reads the [default] profile.\n");
  for (const warning of warnings) io.err(`warning: ${warning}\n`);
  return 0;
}
