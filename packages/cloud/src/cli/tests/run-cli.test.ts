import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../run-cli.ts";

const examples = fileURLToPath(new URL("../../../examples/", import.meta.url));
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

async function cli(argv: string[], cwd = examples) {
  let out = "";
  let err = "";
  const code = await runCli(argv, { out: (text) => { out += text; }, err: (text) => { err += text; }, cwd, platform: "linux" }, { packageVersion: "0.1.0", runner: { run: async () => ({ code: 1, stdout: "", stderr: "no docker in tests" }) } });
  return { code, out, err };
}

function tempDir(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "fluxiq-cloud-cli-"));
  roots.push(root);
  return root;
}

describe("fluxiq-cloud", () => {
  it("render validates a production config and writes exactly the server's files, deploying nothing", async () => {
    const out = path.join(tempDir(), "bundle");
    const result = await cli(["render", "--profile", "production", "--config", "production.config.json", "--out", out]);
    expect(result).toMatchObject({ code: 0, err: "" });
    expect(result.out).toContain("(profile production)");
    expect(result.out).toContain("Nothing was deployed.");
    expect(readdirSync(out).sort()).toEqual(["caddy", "compose", "deployment.json", "env"]);
    expect(readFileSync(path.join(out, "env", "service.env"), "utf8")).toContain("FLUXIQ_PUBLIC_ORIGIN=https://app.example.org\n");
  });

  it("refuses a --profile that is not the config's", async () => {
    const result = await cli(["render", "--profile", "production", "--config", "local.config.json", "--out", path.join(tempDir(), "x")]);
    expect(result.code).toBe(1);
    expect(result.err).toContain('--profile production does not match the config\'s profile "local"');
  });

  it("lists every problem of an invalid config and exits 1", async () => {
    const root = tempDir();
    writeFileSync(path.join(root, "fluxiq-cloud.config.json"), JSON.stringify({ project: "x", profile: "staging" }));
    const result = await cli(["status"], root);
    expect(result.code).toBe(1);
    expect(result.err).toContain("is not a usable fluxiq-cloud config:");
    expect(result.err).toContain('  - profile: must be one of "local", "production"');
    expect(result.err).toContain("  - driver: is required");
  });

  it("names a missing config file and how to point at one", async () => {
    const result = await cli(["up"], tempDir());
    expect(result.code).toBe(1);
    expect(result.err).toContain("could not be read; pass --config <file>");
  });

  it("refuses an unbuilt driver before touching anything", async () => {
    const root = tempDir();
    const config = JSON.parse(readFileSync(path.join(examples, "production.config.json"), "utf8")) as Record<string, unknown>;
    writeFileSync(path.join(root, "fluxiq-cloud.config.json"), JSON.stringify({ ...config, driver: "vm" }));
    const result = await cli(["up"], root);
    expect(result.code).toBe(1);
    expect(result.err).toContain('The "vm" driver is not built yet');
  });

  it("answers wrong command lines with exit 2 and the help", async () => {
    expect((await cli(["launch"])).code).toBe(2);
    expect((await cli(["up", "--force"])).err).toContain('Unknown flag "--force"');
    expect((await cli(["render"])).err).toContain("render needs --out <dir>");
    const help = await cli([]);
    expect(help.code).toBe(0);
    expect(help.out).toContain("Usage: fluxiq-cloud <command>");
  });

  it("prints the config schema", async () => {
    const result = await cli(["schema"]);
    expect(JSON.parse(result.out)).toMatchObject({ title: "fluxiq-cloud.config.json" });
  });
});
