import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SdkError } from "../../errors/index.ts";
import { resolveCredential } from "../credential-chain.ts";
import { generateKeyPair } from "../generate-key-pair.ts";

let root = "";
let project = "";
let env: NodeJS.ProcessEnv = {};

function makeKey(name: string, directory = path.join(root, "keys")): { file: string; keyId: string; pem: string } {
  mkdirSync(directory, { recursive: true });
  const pair = generateKeyPair();
  const file = path.join(directory, name);
  writeFileSync(file, pair.privateKeyPem, { mode: 0o600 });
  return { file, keyId: pair.keyId, pem: pair.privateKeyPem };
}

function writeCredentials(text: string): void {
  writeFileSync(path.join(root, "credentials"), text);
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "sdk-chain-"));
  project = path.join(root, "project");
  mkdirSync(project);
  env = { FLUXIQ_CONFIG_DIR: root };
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("resolveCredential", () => {
  it("finds nothing when nothing is named: open mode", () => {
    expect(resolveCredential({}, { env, cwd: project })).toBeUndefined();
  });

  it("prefers an explicit option over everything", () => {
    const explicit = makeKey("explicit.pem");
    const other = makeKey("other.pem");
    const found = resolveCredential({ keyFile: explicit.file }, { env: { ...env, FLUXIQ_KEY_FILE: other.file }, cwd: project });
    expect(found?.key.keyId).toBe(explicit.keyId);
    expect(found?.explicit).toBe(true);
  });

  it("takes FLUXIQ_KEY before FLUXIQ_KEY_FILE", () => {
    const text = makeKey("a.pem");
    const file = makeKey("b.pem");
    const found = resolveCredential({}, { env: { ...env, FLUXIQ_KEY: text.pem, FLUXIQ_KEY_FILE: file.file }, cwd: project });
    expect(found?.key.keyId).toBe(text.keyId);
  });

  it("reads FLUXIQ_KEY_PROFILE from the credentials file", () => {
    const key = makeKey("ci.pem");
    writeCredentials(`[ci]\nendpoint = https://cloud.example\nkey_file = ${key.file}\n`);
    const found = resolveCredential({}, { env: { ...env, FLUXIQ_KEY_PROFILE: "ci" }, cwd: project });
    expect(found?.key.keyId).toBe(key.keyId);
    expect(found?.endpoint).toBe("https://cloud.example");
  });

  it("errors on a named profile that does not exist", () => {
    writeCredentials("[default]\nendpoint = local\n");
    expect(() => resolveCredential({ profile: "nope" }, { env, cwd: project })).toThrow(/has no \[nope\] section/u);
  });

  it("uses the [default] profile the first start wrote, as implicit", () => {
    const owner = makeKey("owner.pem");
    writeCredentials(`[default]\nendpoint = local\nkey_file = ${owner.file}\n`);
    const found = resolveCredential({}, { env, cwd: project });
    expect(found?.key.keyId).toBe(owner.keyId);
    expect(found?.explicit).toBe(false);
  });

  it("takes a profile named by the project's fluxiq.config.json", () => {
    const key = makeKey("staging.pem");
    writeCredentials(`[staging]\nkey_file = ${key.file}\n`);
    writeFileSync(path.join(project, "fluxiq.config.json"), JSON.stringify({ profile: "staging" }));
    expect(resolveCredential({}, { env, cwd: project })?.key.keyId).toBe(key.keyId);
  });

  it("refuses a project config that holds a key", () => {
    writeFileSync(path.join(project, "fluxiq.config.json"), JSON.stringify({ privateKey: "x" }));
    expect(() => resolveCredential({}, { env, cwd: project })).toThrow(/A project never holds a key/u);
  });

  it("refuses a profile whose key file is outside keys/", () => {
    const stray = makeKey("stray.pem", path.join(root, "elsewhere"));
    writeCredentials(`[default]\nkey_file = ${stray.file}\n`);
    expect(() => resolveCredential({}, { env, cwd: project })).toThrow(/outside .*keys/u);
  });

  it("never falls through from a broken key to open mode", () => {
    const broken = path.join(root, "keys", "broken.pem");
    mkdirSync(path.dirname(broken), { recursive: true });
    writeFileSync(broken, "not a key", { mode: 0o600 });
    writeCredentials(`[default]\nkey_file = ${broken}\n`);
    expect(() => resolveCredential({}, { env, cwd: project })).toThrow(SdkError);
    expect(() => resolveCredential({}, { env: { ...env, FLUXIQ_KEY: "garbage" }, cwd: project })).toThrow(/FLUXIQ_KEY is not a PKCS#8/u);
  });
});
