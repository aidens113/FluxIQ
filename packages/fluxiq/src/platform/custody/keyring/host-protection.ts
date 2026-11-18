import { randomBytes, randomUUID } from "node:crypto";
import { closeSync, constants, existsSync, fsyncSync, mkdirSync, openSync, writeFileSync } from "node:fs";
import path from "node:path";
import { AesGcmSecretKeyHostProtection, SecretKeyProtectionUnavailableError, type SecretKeyHostProtection } from "../protection/index.ts";
import { parseSecretKeyHostKeyring, type SecretKeyHostKeyring } from "./parse.ts";
import { createPrivateHostFile, readPrivateHostFile } from "./private-file.ts";
import { windowsProtectKeyring } from "./windows-protection.ts";

/** Persistent host custody. Service deployments require an explicit mounted secret; local hosts initialize once. */
export function createHostSecretKeyProtection(input: {
  profile: "local" | "self-hosted" | "service";
  rootDir?: string;
  keyringFile?: string;
}): SecretKeyHostProtection {
  let memory: SecretKeyHostKeyring | undefined;
  return new AesGcmSecretKeyHostProtection(({ keyId }) => {
    let ring: SecretKeyHostKeyring;
    try {
      if (input.keyringFile) {
        const bytes = readPrivateHostFile(input.keyringFile);
        if (!bytes) throw new Error("Host keyring is missing.");
        try { ring = parseSecretKeyHostKeyring(bytes.toString("utf8")); } finally { bytes.fill(0); }
      }
      else if (input.profile === "service") throw new Error("Service host keyring is not configured.");
      else if (input.rootDir) ring = memory ??= localKeyring(input.rootDir);
      else ring = memory ??= newKeyring(); // Explicitly non-durable in-memory Core instance.
    } catch {
      throw new SecretKeyProtectionUnavailableError();
    }
    const selected = keyId ?? ring.currentKeyId;
    const encoded = Object.hasOwn(ring.keys, selected) ? ring.keys[selected] : undefined;
    return encoded ? { keyId: selected, key: Buffer.from(encoded, "base64") } : undefined;
  });
}

function newKeyring(): SecretKeyHostKeyring {
  const keyId = randomUUID();
  return { version: 1, currentKeyId: keyId, keys: { [keyId]: randomBytes(32).toString("base64") } };
}

function localKeyring(rootDir: string): SecretKeyHostKeyring {
  const directory = path.join(rootDir, "host-secrets");
  const file = path.join(directory, process.platform === "win32" ? "keyring.dpapi" : "keyring.json");
  // This non-secret marker survives loss of the separate private key directory.
  const marker = path.join(rootDir, "host-keyring-initialized");
  let bytes = readPrivateHostFile(file);
  if (!bytes) {
    if (existsSync(marker)) throw new Error("The original host keyring must be restored.");
    const plain = Buffer.from(JSON.stringify(newKeyring()));
    try { createPrivateHostFile(file, process.platform === "win32" ? windowsProtectKeyring(plain, "Protect") : plain); }
    finally { plain.fill(0); }
    bytes = readPrivateHostFile(file);
    if (!bytes) throw new Error("Host keyring publication failed.");
  }
  const plain = process.platform === "win32" ? windowsProtectKeyring(bytes, "Unprotect") : bytes;
  try {
    const ring = parseSecretKeyHostKeyring(plain.toString("utf8"));
    mkdirSync(rootDir, { recursive: true });
    try {
      const descriptor = openSync(marker, "wx", 0o600);
      try {
        writeFileSync(descriptor, "1\n");
        fsyncSync(descriptor);
      } finally { closeSync(descriptor); }
      if (process.platform !== "win32") {
        const directory = openSync(rootDir, "r");
        try { fsyncSync(directory); } finally { closeSync(directory); }
      }
    }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    // A concurrent initializer may have created this marker but not flushed it yet.
    const markerDescriptor = openSync(marker, constants.O_RDWR | (constants.O_NOFOLLOW ?? 0));
    try { fsyncSync(markerDescriptor); } finally { closeSync(markerDescriptor); }
    if (process.platform !== "win32") {
      const parent = openSync(rootDir, "r");
      try { fsyncSync(parent); } finally { closeSync(parent); }
    }
    return ring;
  } finally {
    plain.fill(0);
    bytes.fill(0);
  }
}
