import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { parseCloudConfig } from "../../../config/index.ts";
import { cloudStateStore } from "../../../state/index.ts";
import { createPlatformDriver } from "../../create-platform-driver.ts";
import type { DriverContext } from "../../types.ts";
import { FakeDocker } from "./fake-docker.ts";

const repositoryRoot = fileURLToPath(new URL("../../../../../../", import.meta.url)).replace(/\\/gu, "/");
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function setUp(overrides: Record<string, unknown> = {}, platform: NodeJS.Platform = "win32") {
  const root = mkdtempSync(path.join(os.tmpdir(), "fluxiq-cloud-driver-"));
  roots.push(root);
  const file = path.join(root, "fluxiq-cloud.config.json");
  const example = JSON.parse(readFileSync(new URL("../../../../examples/local.config.json", import.meta.url), "utf8")) as Record<string, unknown>;
  writeFileSync(file, JSON.stringify({ ...example, source: { root: repositoryRoot }, ...overrides }));
  const config = parseCloudConfig(readFileSync(file, "utf8"), file);
  const logs: string[] = [];
  const probe = createPlatformDriver("local-docker", { runner: { run: async () => ({ code: 0, stdout: "", stderr: "" }) }, log: () => undefined, sleep: async () => undefined, platform }, "0.1.0").plan(config);
  const docker = new FakeDocker({ coreImage: probe.coreImage, services: probe.services, pulledImages: probe.pulledImages });
  const context: DriverContext = { runner: docker, log: (line) => logs.push(line), sleep: async () => undefined, platform };
  const driver = createPlatformDriver("local-docker", context, "0.1.0");
  const plan = driver.plan(config);
  const state = async () => (await cloudStateStore.read(plan.stateFile)) ?? cloudStateStore.empty(plan);
  return { root, config, docker, driver, plan, state, logs };
}

/** Someone else's resources on the same Docker, which down must never touch. */
function addForeignResources(docker: FakeDocker): void {
  docker.containers.set("someone-else", { labels: { "com.fluxiq.cloud.project": "another-project" }, image: "redis:7" });
  docker.containers.set("unlabelled", { labels: {}, image: "postgres:17" });
  docker.networks.set("bridge", {});
  docker.networks.set("another-project_runners", { "com.fluxiq.cloud.project": "another-project" });
  docker.volumes.set("user-data", {});
  docker.images.set("redis:7", {});
  docker.images.set("postgres:17", {});
  docker.images.set("caddy:2.10-alpine", {});
}

const removalCalls = (docker: FakeDocker) => docker.calls.filter((call) => call.command === "docker" && (call.args[0] === "rm" || call.args[1] === "rm"));

describe("local-docker driver", () => {
  it("brings the platform up: secrets, bundle, runners network, image, services, the exported certificate", async () => {
    const { docker, driver, plan } = setUp();
    const state = await driver.up(plan, { build: false });
    expect(state.phase).toBe("up");
    expect(docker.labelled("fluxiq-local")).toEqual({
      containers: ["fluxiq-local-fluxiq-1", "fluxiq-local-caddy-1", "fluxiq-local-mailpit-1", "fluxiq-local-stripe-mock-1"],
      networks: ["fluxiq-local_runners", "fluxiq-local_edge", "fluxiq-local_provisioning"],
      volumes: ["fluxiq-local_secrets", "fluxiq-local_fluxiq-data", "fluxiq-local_caddy-data", "fluxiq-local_caddy-config"],
      images: ["fluxiq-cloud/core:0.1.0"]
    });
    expect(state.generatedSecrets.map((file) => path.basename(file))).toEqual(["provisioning-token", "setup-code", "secret-keyring", "stripe-secret-key", "stripe-webhook-secret"]);
    expect(state.pulledImages).toEqual(["caddy:2.10-alpine", "axllent/mailpit:v1.33.1", "stripe/stripe-mock:v0.205.0", "node:22-trixie-slim"]);
    expect(readFileSync(plan.exportedCa ?? "", "utf8")).toBe(docker.pem);
    expect(existsSync(`${plan.bundleDir}/compose/cloud.override.yml`)).toBe(true);
    expect([...docker.secretsVolumeFiles.keys()]).toEqual(["provisioning_token", "setup_code", "secret_keyring", "stripe_secret_key", "stripe_webhook_secret", "commerce_config"]);
    expect(docker.secretsVolumeFiles.get("commerce_config")).toBe(plan.renderedFiles[0]?.content);
    expect(JSON.parse(docker.secretsVolumeFiles.get("commerce_config") ?? "")).toMatchObject({ provider: "stripe", webhookSecretFile: "/run/secrets/stripe_webhook_secret" });
    expect(docker.secretsVolumeFiles.get("stripe_webhook_secret")).toMatch(/^whsec_[0-9a-f]{48}\n$/u);
    expect(docker.secretsVolumeFiles.get("secret_keyring")).toBe(readFileSync(plan.secrets[2]?.file ?? "", "utf8"));
    expect(JSON.parse(docker.secretsVolumeFiles.get("secret_keyring") ?? "")).toMatchObject({ version: 1, currentKeyId: expect.any(String) });
    const sync = docker.calls.find((call) => call.args[0] === "run");
    const token = docker.secretsVolumeFiles.get("provisioning_token") ?? "?";
    expect(sync?.args).toEqual(expect.arrayContaining(["--network", "none", "--cap-drop", "ALL", "--cap-add", "CHOWN", "--read-only", "--volume", "fluxiq-local_secrets:/secrets"]));
    expect(sync?.args.join(" ")).not.toContain(token.trim());
    expect(sync?.input).toContain(token.trim());
    const syncAt = docker.calls.indexOf(sync as (typeof docker.calls)[number]);
    expect(docker.calls.findIndex((call) => call.args.includes("up"))).toBeGreaterThan(syncAt);
  });

  it("is idempotent: a second up builds nothing, creates nothing and regenerates no secret", async () => {
    const { docker, driver, plan } = setUp();
    const first = await driver.up(plan, { build: false });
    const secrets = plan.secrets.map((secret) => readFileSync(secret.file, "utf8"));
    const before = JSON.stringify(docker.labelled("fluxiq-local"));
    const callsBefore = docker.calls.length;
    const second = await driver.up(plan, { build: false });
    const again = docker.calls.slice(callsBefore);
    expect(again.some((call) => call.args.includes("build") || call.args[1] === "create")).toBe(false);
    expect(JSON.stringify(docker.labelled("fluxiq-local"))).toBe(before);
    expect(plan.secrets.map((secret) => readFileSync(secret.file, "utf8"))).toEqual(secrets);
    expect({ ...second, phase: "x" }).toEqual({ ...first, phase: "x" });
  });

  it("down removes only what is labelled with the project or recorded in its state, and nothing of anyone else's", async () => {
    const { docker, driver, plan, state, root } = setUp();
    addForeignResources(docker);
    await driver.up(plan, { build: false });
    const ours = docker.labelled("fluxiq-local");
    const recorded = (await state()).pulledImages;
    const report = await driver.down(await state(), { keepData: false, keepImages: false });

    expect(docker.labelled("fluxiq-local")).toEqual({ containers: [], networks: [], volumes: [], images: [] });
    expect([...docker.containers.keys()]).toEqual(["someone-else", "unlabelled"]);
    expect([...docker.networks.keys()]).toEqual(["bridge", "another-project_runners"]);
    expect([...docker.volumes.keys()]).toEqual(["user-data"]);
    expect([...docker.images.keys()].sort()).toEqual(["caddy:2.10-alpine", "postgres:17", "redis:7"]);
    const allowed = new Set([...ours.containers, ...ours.networks, ...ours.volumes, ...ours.images, ...recorded]);
    for (const call of removalCalls(docker)) {
      for (const target of call.args.slice(call.args[0] === "rm" ? 1 : 2).filter((arg) => !arg.startsWith("--"))) expect(allowed.has(target)).toBe(true);
    }
    expect(report.removed).toMatchObject({ containers: 0, networks: 1, volumes: 1, images: 3 });
    expect(existsSync(plan.stateFile)).toBe(false);
    expect(existsSync(path.join(root, ".fluxiq", "cloud"))).toBe(false);
  });

  it("is idempotent: down on nothing succeeds and removes nothing", async () => {
    const { docker, driver, plan, state } = setUp();
    addForeignResources(docker);
    await driver.up(plan, { build: false });
    await driver.down(await state(), { keepData: false, keepImages: false });
    const callsBefore = docker.calls.length;
    const report = await driver.down(await state(), { keepData: false, keepImages: false });
    expect(report.removed).toEqual({ containers: 0, networks: 0, volumes: 0, images: 0, files: 0 });
    expect(removalCalls({ calls: docker.calls.slice(callsBefore) } as FakeDocker)).toEqual([]);
    expect([...docker.containers.keys()]).toEqual(["someone-else", "unlabelled"]);
  });

  it("cleans up after an up that failed half way", async () => {
    const { docker, driver, plan, state } = setUp();
    docker.failComposeUp = true;
    await expect(driver.up(plan, { build: false })).rejects.toThrow("Starting the services failed");
    expect((await state()).phase).toBe("starting");
    expect(docker.labelled("fluxiq-local").networks).toEqual(["fluxiq-local_runners"]);
    await driver.down(await state(), { keepData: false, keepImages: false });
    expect(docker.labelled("fluxiq-local")).toEqual({ containers: [], networks: [], volumes: [], images: [] });
    expect(existsSync(plan.secrets[0]?.file ?? "")).toBe(false);
  });

  it("down with keepData keeps the volumes, the secrets that seal them and the state, and up brings it back as it was", async () => {
    const { docker, driver, plan, state } = setUp();
    await driver.up(plan, { build: false });
    const keyring = readFileSync(plan.secrets[2]?.file ?? "", "utf8");
    await driver.down(await state(), { keepData: true, keepImages: true });
    expect(docker.labelled("fluxiq-local")).toMatchObject({ containers: [], networks: [], volumes: ["fluxiq-local_secrets", "fluxiq-local_fluxiq-data", "fluxiq-local_caddy-data", "fluxiq-local_caddy-config"], images: ["fluxiq-cloud/core:0.1.0"] });
    expect((await state()).phase).toBe("stopped");
    const callsBefore = docker.calls.length;
    await driver.up(plan, { build: false });
    expect(docker.calls.slice(callsBefore).some((call) => call.args.includes("build"))).toBe(false);
    expect(readFileSync(plan.secrets[2]?.file ?? "", "utf8")).toBe(keyring);
    await driver.down(await state(), { keepData: false, keepImages: false });
    expect(docker.labelled("fluxiq-local")).toEqual({ containers: [], networks: [], volumes: [], images: [] });
  });

  it("creates the runners network with traffic between containers off, so one customer's browser cannot reach another's", async () => {
    const { docker, driver, plan } = setUp();
    await driver.up(plan, { build: false });
    const create = docker.calls.find((call) => call.command === "docker" && call.args[0] === "network" && call.args[1] === "create" && call.args.at(-1) === "fluxiq-local_runners");
    expect(create?.args).toEqual(expect.arrayContaining(["--opt", "com.docker.network.bridge.enable_icc=false"]));
  });

  it("refuses to adopt a runners network that belongs to someone else", async () => {
    const { docker, driver, plan } = setUp();
    docker.networks.set("fluxiq-local_runners", { "com.fluxiq.cloud.project": "another-project" });
    await expect(driver.up(plan, { build: false })).rejects.toThrow("is not this deployment's");
  });

  it("trusts the local authority for the current Windows user only when asked, and down removes it", async () => {
    const { docker, driver, plan, state } = setUp({ tls: { mode: "internal", email: "operator@fluxiq.localhost", trustLocalCa: true } });
    const upState = await driver.up(plan, { build: false });
    const add = docker.calls.find((call) => call.command === "certutil");
    expect(add?.args).toEqual(["-user", "-addstore", "-f", "Root", plan.exportedCa]);
    expect(upState.trustedCa?.thumbprint).toMatch(/^[0-9A-F]{40}$/u);
    await driver.down(await state(), { keepData: false, keepImages: false });
    expect(docker.calls.filter((call) => call.command === "certutil").at(-1)?.args).toEqual(["-user", "-delstore", "Root", upState.trustedCa?.thumbprint]);
    expect(docker.calls.filter((call) => call.command === "certutil").every((call) => call.args[0] === "-user")).toBe(true);
    expect(docker.trusted.size).toBe(0);
  });

  it("never touches a trust store when local trust is off", async () => {
    const { docker, driver, plan, state } = setUp();
    await driver.up(plan, { build: false });
    await driver.down(await state(), { keepData: false, keepImages: false });
    expect(docker.calls.some((call) => call.command === "certutil")).toBe(false);
  });

  it("says so plainly when Docker is not running, before touching anything", async () => {
    const { docker, driver, plan } = setUp();
    docker.running = false;
    await expect(driver.up(plan, { build: false })).rejects.toThrow("Docker is not running");
    expect(existsSync(plan.stateFile)).toBe(false);
    expect(existsSync(plan.secrets[0]?.file ?? "")).toBe(false);
  });

  it("reports each service with its state and health, and the URLs", async () => {
    const { driver, plan, state } = setUp();
    await driver.up(plan, { build: false });
    const status = await driver.status(await state());
    expect(status.services.map((service) => [service.service, service.state, service.health])).toEqual([["caddy", "running", "healthy"], ["fluxiq", "running", "healthy"], ["mailpit", "running", "healthy"], ["stripe-mock", "running", "healthy"]]);
    expect(status.urls).toEqual({ panel: "https://app.fluxiq.localhost", mail: "http://127.0.0.1:8025" });
    expect(status.labelled).toEqual({ containers: 4, networks: 3, volumes: 4, images: 1 });
  });
});

describe("drivers that are not built", () => {
  it.each(["vm", "aws", "gcp", "azure"] as const)("%s refuses every operation with a clear error", async (name) => {
    const { config, plan, state } = setUp({ driver: name });
    const docker = new FakeDocker({ coreImage: plan.coreImage, services: [], pulledImages: [] });
    const driver = createPlatformDriver(name, { runner: docker, log: () => undefined, sleep: async () => undefined, platform: "linux" }, "0.1.0");
    expect(() => driver.plan(config)).toThrow(`The "${name}" driver is not built yet`);
    expect(() => driver.up(plan, { build: false })).toThrow("not built");
    const recorded = await state();
    expect(() => driver.down(recorded, { keepData: false, keepImages: false })).toThrow("not built");
    expect(() => driver.status(recorded)).toThrow("not built");
    expect(docker.calls).toEqual([]);
    expect(existsSync(plan.stateFile)).toBe(false);
  });
});
