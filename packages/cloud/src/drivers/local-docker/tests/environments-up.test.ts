import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { CloudConfigError, parseCloudConfig } from "../../../config/index.ts";
import { createPlatformDriver } from "../../create-platform-driver.ts";
import type { DriverContext } from "../../types.ts";
import { FakeDocker } from "./fake-docker.ts";

// A rehearsal with dedicated browsers: the config's rules, the plan (Core
// gets the engine socket in its group and the docker driver's settings), and
// `up` building the labelled runner image from the extension checkout and
// handing Core the local root its runners trust.

const repositoryRoot = fileURLToPath(new URL("../../../../../../", import.meta.url)).replace(/\\/gu, "/");
const example = JSON.parse(readFileSync(new URL("../../../../examples/local-environments.config.json", import.meta.url), "utf8")) as Record<string, unknown>;
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function setUp(overrides: Record<string, unknown> = {}, built = true) {
  const root = mkdtempSync(path.join(os.tmpdir(), "fluxiq-cloud-environments-"));
  roots.push(root);
  const context = path.join(root, "extension");
  mkdirSync(path.join(context, "deploy", "runner"), { recursive: true });
  writeFileSync(path.join(context, "deploy", "runner", "Dockerfile"), "ARG NODE_IMAGE=node:22-trixie-slim\nFROM ${NODE_IMAGE}\n");
  if (built) {
    for (const file of ["apps/extension/dist/chrome/manifest.json", "packages/browser-host/dist/runner/main.js"]) {
      mkdirSync(path.dirname(path.join(context, file)), { recursive: true });
      writeFileSync(path.join(context, file), "{}");
    }
  }
  const file = path.join(root, "fluxiq-cloud.config.json");
  writeFileSync(file, JSON.stringify({ ...example, source: { root: repositoryRoot }, environments: { runner: { context } }, ...overrides }));
  const config = parseCloudConfig(readFileSync(file, "utf8"), file);
  const probe = createPlatformDriver("local-docker", { runner: { run: async () => ({ code: 0, stdout: "", stderr: "" }) }, log: () => undefined, sleep: async () => undefined, platform: "win32" }, "0.1.0").plan(config);
  const docker = new FakeDocker({ coreImage: probe.coreImage, services: probe.services, pulledImages: probe.pulledImages });
  const driverContext: DriverContext = { runner: docker, log: () => undefined, sleep: async () => undefined, platform: "win32" };
  const driver = createPlatformDriver("local-docker", driverContext, "0.1.0");
  return { config, docker, driver, plan: driver.plan(config) };
}

const text = (plan: ReturnType<typeof setUp>["plan"], file: string) => {
  const entry = plan.files[file];
  if (entry === undefined || !("content" in entry)) throw new Error(`${file} is not rendered`);
  return entry.content;
};

describe("dedicated browsers on a local rehearsal", () => {
  it("gives Core the engine's socket in its group and the docker driver's settings, and plans the runner image", () => {
    const { plan } = setUp();
    expect(plan.environments).toMatchObject({ image: "fluxiq-cloud/runner:0.1.0", dockerfile: "deploy/runner/Dockerfile", authoritySecret: "runner_authority" });
    const override = text(plan, "compose/cloud.override.yml");
    expect(override).toContain("/var/run/docker.sock:/var/run/docker.sock");
    expect(override).toContain("${FLUXIQ_DOCKER_SOCKET_GROUP}");
    expect(text(plan, "compose/compose.env")).toContain("FLUXIQ_DOCKER_SOCKET_GROUP=0");
    const env = text(plan, "env/service.env");
    for (const line of ["FLUXIQ_ENVIRONMENT_DRIVER=docker", "FLUXIQ_ENVIRONMENT_DOCKER_PROJECT=fluxiq-local", "FLUXIQ_ENVIRONMENT_DOCKER_IMAGE=fluxiq-cloud/runner:0.1.0", "FLUXIQ_ENVIRONMENT_DOCKER_NETWORK=fluxiq-local_runners", "FLUXIQ_ENVIRONMENT_CLIENT_DOMAIN=web-automation", "FLUXIQ_ENVIRONMENT_RUNNER_RESOLVE_TO=host.docker.internal", "FLUXIQ_ENVIRONMENT_RUNNER_AUTHORITY_FILE=/run/secrets/runner_authority"]) {
      expect(env).toContain(line);
    }
    expect(JSON.parse(text(plan, "env/commerce.json"))).toMatchObject({ provider: "fake" });
  });

  it("gives Core no socket when the deployment has no dedicated browsers", () => {
    const { plan } = setUp({ environments: undefined });
    expect(plan.environments).toBeNull();
    expect(text(plan, "compose/cloud.override.yml")).not.toContain("docker.sock");
    expect(text(plan, "env/service.env")).not.toContain("FLUXIQ_ENVIRONMENT_");
  });

  it("refuses dedicated browsers on a self-hosted server, on production, and without a plan that sells one", () => {
    const issues = (overrides: Record<string, unknown>) => {
      try {
        setUp(overrides);
        return [];
      } catch (error) {
        if (!(error instanceof CloudConfigError)) throw error;
        return error.issues.filter((issue) => issue.path === "environments").map((issue) => issue.message);
      }
    };
    expect(issues({ billing: { ...(example.billing as object), plans: { shared: { priceId: "price_shared", grants: [{ key: "cloud.shared", allocation: "shared", capabilities: ["execute"], regions: ["local"] }] } } } })).toEqual([expect.stringContaining("needs billing with a plan that grants a dedicated browser")]);
    expect(issues({ profile: "production" })).toContainEqual(expect.stringContaining("runs only on the local profile"));
    expect(issues({ mode: "self-hosted", billing: undefined, payments: undefined, provisioning: undefined, signup: undefined, sinks: { mail: true } })).toContainEqual(expect.stringContaining("applies to a service only"));
  });

  it("builds the runner image labelled for the project and hands Core the local root its runners trust", async () => {
    const { docker, driver, plan } = setUp();
    await driver.up(plan, { build: false });
    expect(docker.images.get("fluxiq-cloud/runner:0.1.0")).toMatchObject({ "com.fluxiq.cloud.project": "fluxiq-local" });
    expect(docker.secretsVolumeFiles.get("runner_authority")).toContain("BEGIN CERTIFICATE");
  });

  it("refuses to build the runner image before the extension checkout is built, naming the commands", async () => {
    const { driver, plan } = setUp({}, false);
    await expect(driver.up(plan, { build: false })).rejects.toThrow(/pnpm --filter @fluxiq-web-extension\/extension build/u);
  });
});
