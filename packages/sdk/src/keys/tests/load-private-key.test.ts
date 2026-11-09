import { generateKeyPairSync } from "node:crypto";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SdkError } from "../../errors/index.ts";
import { generateKeyPair } from "../generate-key-pair.ts";
import { loadPrivateKeyFile, loadPrivateKeyText } from "../load-private-key.ts";

let directory = "";
beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), "sdk-key-"));
});
afterEach(() => rmSync(directory, { recursive: true, force: true }));

describe("loadPrivateKeyText", () => {
  it("loads PKCS#8 PEM and gives the id the generator reported", () => {
    const pair = generateKeyPair();
    expect(loadPrivateKeyText(pair.privateKeyPem, "test").keyId).toBe(pair.keyId);
  });

  it("loads the one-line fxkey1 form", () => {
    const pair = generateKeyPair();
    const body = pair.privateKeyPem.replace(/-----[^-]+-----|\s/gu, "");
    expect(loadPrivateKeyText(`fxkey1.${Buffer.from(body, "base64").toString("base64url")}`, "test").keyId).toBe(pair.keyId);
  });

  it("refuses text that is not a key, and a key of another kind, never skipping it", () => {
    expect(() => loadPrivateKeyText("nonsense", "the apiKey option")).toThrow(SdkError);
    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ format: "pem", type: "pkcs8" }).toString();
    expect(() => loadPrivateKeyText(rsa, "test")).toThrow(/not Ed25519/u);
  });

  it("does not put key material in its message", () => {
    const pair = generateKeyPair();
    const body = pair.privateKeyPem.replace(/-----[^-]+-----|\s/gu, "");
    const truncated = `${pair.privateKeyPem.slice(0, 70)}\n-----END PRIVATE KEY-----`;
    expect(() => loadPrivateKeyText(truncated, "test")).toThrow(SdkError);
    try {
      loadPrivateKeyText(truncated, "test");
    } catch (error) {
      expect((error as Error).message).not.toContain(body.slice(10, 40));
    }
  });
});

describe("loadPrivateKeyFile", () => {
  it("loads a file", () => {
    const pair = generateKeyPair();
    const file = path.join(directory, "k.pem");
    writeFileSync(file, pair.privateKeyPem, { mode: 0o600 });
    expect(loadPrivateKeyFile(file, "test").keyId).toBe(pair.keyId);
  });

  it("names a missing file", () => {
    expect(() => loadPrivateKeyFile(path.join(directory, "none.pem"), "FLUXIQ_KEY_FILE")).toThrow(/could not be read/u);
  });

  it.skipIf(process.platform === "win32")("refuses a key other users can read, as ssh does", () => {
    const file = path.join(directory, "open.pem");
    writeFileSync(file, generateKeyPair().privateKeyPem);
    chmodSync(file, 0o644);
    expect(() => loadPrivateKeyFile(file, "test")).toThrow(/can be read by other users/u);
  });
});
