import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveCredential } from "../../keys/index.ts";
import type { CliIo } from "../cli-io.ts";
import { initCommand } from "../init-command.ts";

let root = "";
let project = "";
let output = "";
let errors = "";

function io(): CliIo {
  return { out: (text) => void (output += text), err: (text) => void (errors += text), env: { FLUXIQ_CONFIG_DIR: path.join(root, "home", ".fluxiq") }, cwd: project };
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "sdk-init-"));
  project = path.join(root, "project");
  output = "";
  errors = "";
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("fluxiq init", () => {
  it("creates the layout and an owner key, and the SDK then finds that key by itself", () => {
    expect(initCommand(io())).toBe(0);
    const config = path.join(root, "home", ".fluxiq");
    expect(existsSync(path.join(config, "keys", "owner.pem"))).toBe(true);
    expect(readFileSync(path.join(config, "keys", "owner.pem"), "utf8")).toContain("BEGIN PRIVATE KEY");
    expect(readFileSync(path.join(config, "keys", "owner.pub"), "utf8")).toContain("BEGIN PUBLIC KEY");
    const credentials = readFileSync(path.join(config, "credentials"), "utf8");
    expect(credentials).toContain("[default]");
    expect(credentials).not.toContain("PRIVATE");
    const found = resolveCredential({}, { env: io().env, cwd: project });
    expect(found?.key.keyId).toMatch(/^fxk_/u);
    expect(output).toContain(found?.key.keyId);
  });

  it("writes nothing into the project and prints no private key", () => {
    mkdirSync(project);
    initCommand(io());
    expect(readdirSync(project)).toEqual([]);
    expect(output + errors).not.toContain("PRIVATE KEY");
  });

  it.skipIf(process.platform === "win32")("makes the key file and folder owner-only on POSIX", () => {
    initCommand(io());
    const config = path.join(root, "home", ".fluxiq");
    expect(statSync(path.join(config, "keys", "owner.pem")).mode & 0o777).toBe(0o600);
    expect(statSync(path.join(config, "keys")).mode & 0o777).toBe(0o700);
  });

  it("changes nothing on a second run", () => {
    initCommand(io());
    const keyFile = path.join(root, "home", ".fluxiq", "keys", "owner.pem");
    const first = readFileSync(keyFile, "utf8");
    output = "";
    initCommand(io());
    expect(readFileSync(keyFile, "utf8")).toBe(first);
    expect(output).toContain("Found your owner key");
  });
});
