import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FluxIQ } from "../../client/index.ts";
import { loadPrivateKeyFile } from "../../keys/index.ts";
import { checkedListingsScenario } from "../../tests/fake-engine/checked-listings-scenario.ts";
import { listingsNode } from "../../tests/fake-engine/listings-node.ts";
import { startFakeEngine, type FakeEngine } from "../../tests/fake-engine/start-fake-engine.ts";
import type { CliIo } from "../cli-io.ts";
import { initCommand } from "../init-command.ts";
import { runCli } from "../run-cli.ts";

let root = "";
let project = "";
let engine: FakeEngine | undefined;
let output = "";
let errors = "";
let env: NodeJS.ProcessEnv = {};

function io(): CliIo {
  return { out: (text) => void (output += text), err: (text) => void (errors += text), env, cwd: project };
}

beforeEach(async () => {
  root = mkdtempSync(path.join(tmpdir(), "sdk-cli-"));
  project = path.join(root, "project");
  mkdirSync(project);
  output = "";
  errors = "";
  env = { FLUXIQ_CONFIG_DIR: path.join(root, "home"), FLUXIQ_ENDPOINT: "" };
  initCommand(io());
  engine = await startFakeEngine({ scenario: checkedListingsScenario(), requireKey: true });
  engine.trust(loadPrivateKeyFile(path.join(root, "home", "keys", "owner.pem"), "test").publicKeySpki.toString("base64url"));
  env.FLUXIQ_ENDPOINT = engine.url;
  output = "";
});
afterEach(async () => {
  await engine?.close();
  rmSync(root, { recursive: true, force: true });
});

async function runOnce(): Promise<string> {
  const fluxiq = await FluxIQ.connect({ env, cwd: project });
  const run = await fluxiq.run(listingsNode(), { query: "lens hood", country: "UK", count: 3 });
  return run.runId;
}

describe("fluxiq runs / inspect", () => {
  it("lists runs and inspects one, using the key init made", async () => {
    const runId = await runOnce();
    expect(await runCli(["runs"], io())).toBe(0);
    expect(output).toContain(runId);
    expect(output).toContain("market.cheapest-listings");
    output = "";
    expect(await runCli(["inspect", runId, "--events"], io())).toBe(0);
    expect(output).toContain("achieved");
    expect(output).toContain("verdict confirmed by check");
    expect(output).toContain("ended");
  });

  it("prints JSON with --json", async () => {
    await runOnce();
    await runCli(["runs", "--json"], io());
    expect(JSON.parse(output).runs).toHaveLength(1);
  });

  it("says what is wrong with a command line", async () => {
    expect(await runCli(["inspect"], io())).toBe(2);
    expect(errors).toContain("Name the run");
    errors = "";
    expect(await runCli(["runs", "--bogus"], io())).toBe(2);
    expect(await runCli(["nonsense"], io())).toBe(2);
    expect(errors).toContain('Unknown command "nonsense"');
  });
});

describe("fluxiq pin", () => {
  it("pins the learned Flow and writes the reviewable file into the project", async () => {
    await runOnce();
    expect(await runCli(["pin", "market.cheapest-listings"], io())).toBe(0);
    const file = path.join(project, "fluxiq", "pinned", "market.cheapest-listings.flow.json");
    expect(JSON.parse(readFileSync(file, "utf8"))).toMatchObject({ format: "fluxiq.fluxnode-flow", pinned: true, name: "market.cheapest-listings" });
    expect(output).toContain("Pinned market.cheapest-listings");
  });
});

describe("fluxiq learn", () => {
  it("runs the node a module exports over the sample inputs", async () => {
    const module = path.join(project, "nodes.mjs");
    const node = listingsNode();
    // A real module would `import { defineFluxNode } from "@fluxiq/sdk"`; a global-symbol mark keeps this test free of a build.
    writeFileSync(module, [`const mark = Symbol.for("fluxiq.sdk.fluxnode");`, `export const listings = { [mark]: true, name: ${JSON.stringify(node.name)}, spec: ${JSON.stringify(node.spec)}, check: () => true, inputsSchema: undefined, outputsSchema: undefined };`].join("\n"));
    const samples = path.join(project, "samples.json");
    writeFileSync(samples, JSON.stringify([{ query: "lens hood", country: "UK", count: 3 }]));
    expect(await runCli(["learn", "nodes.mjs", "--samples", "samples.json"], io())).toBe(0);
    expect(output).toContain("sample 1/1: achieved");
    expect(output).toContain("1 of 1 samples achieved for market.cheapest-listings");
  });

  it("names the problem when the module exports no FluxNode", async () => {
    writeFileSync(path.join(project, "empty.mjs"), "export const nothing = 1;\n");
    expect(await runCli(["learn", "empty.mjs"], io())).toBe(2);
    expect(errors).toContain("exports no FluxNode");
  });
});

describe("fluxiq dev", () => {
  it("says how to install the engine when it is not there", async () => {
    expect(await runCli(["dev"], io())).toBe(1);
    expect(errors).toContain("pnpm add -D fluxiq");
  });

  it("hands over to the engine's own fluxiq dev, with its flags and its exit code", async () => {
    const engineDirectory = path.join(project, "node_modules", "fluxiq");
    mkdirSync(engineDirectory, { recursive: true });
    writeFileSync(path.join(engineDirectory, "package.json"), JSON.stringify({ name: "fluxiq", bin: { fluxiq: "bin.js" } }));
    writeFileSync(path.join(engineDirectory, "bin.js"), `require("node:fs").writeFileSync(require("node:path").join(process.cwd(), "dev-args.json"), JSON.stringify(process.argv.slice(2)));\nprocess.exit(7);\n`);
    expect(await runCli(["dev", "--no-panel"], io())).toBe(7);
    expect(existsSync(path.join(project, "dev-args.json"))).toBe(true);
    expect(JSON.parse(readFileSync(path.join(project, "dev-args.json"), "utf8"))).toEqual(["dev", "--no-panel"]);
  });
});
