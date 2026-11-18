import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseCloudConfig } from "../../config/index.ts";
import { buildCloudPlan } from "../build-cloud-plan.ts";

const NL = String.fromCharCode(10);

const examples = fileURLToPath(new URL("../../../examples/", import.meta.url));
const localConfig = () => parseCloudConfig(readFileSync(`${examples}local.config.json`, "utf8"), `${examples}local.config.json`);
const selfHostedConfig = () => parseCloudConfig(readFileSync(`${examples}self-hosted.config.json`, "utf8"), `${examples}self-hosted.config.json`);
const productionConfig = () => parseCloudConfig(readFileSync(`${examples}production.config.json`, "utf8"), "C:/laptop/production.config.json");

describe("buildCloudPlan", () => {
  it("is deterministic: the same config and version give the same plan, byte for byte", () => {
    expect(JSON.stringify(buildCloudPlan(localConfig(), "1.2.3"))).toBe(JSON.stringify(buildCloudPlan(localConfig(), "1.2.3")));
    expect(JSON.stringify(buildCloudPlan(productionConfig(), "1.2.3"))).toBe(JSON.stringify(buildCloudPlan(productionConfig(), "1.2.3")));
  });

  it("plans the local rehearsal: sinks, the exported certificate, and names derived from the project", () => {
    const plan = buildCloudPlan(localConfig(), "0.1.0");
    expect(plan).toMatchObject({
      project: "fluxiq-local", publicOrigin: "https://app.fluxiq.localhost", coreImage: "fluxiq-cloud/core:0.1.0",
      composeFiles: ["compose/service.compose.yml", "compose/cloud.override.yml", "compose/sinks.compose.yml"],
      services: ["fluxiq", "caddy", "mailpit", "stripe-mock"],
      pulledImages: ["caddy:2.10-alpine", "axllent/mailpit:v1.33.1", "stripe/stripe-mock:v0.205.0"],
      networks: { edge: "fluxiq-local_edge", provisioning: "fluxiq-local_provisioning", runners: "fluxiq-local_runners" },
      volumes: ["fluxiq-local_fluxiq-data", "fluxiq-local_caddy-data", "fluxiq-local_caddy-config"],
      mailUi: "http://127.0.0.1:8025"
    });
    expect(plan.exportedCa).toBe(`${plan.config.stateDir}/certs/root.crt`);
    expect(plan.secrets.map((secret) => [secret.name, secret.generate])).toEqual([
      ["provisioning_token", "token"], ["setup_code", "setup-code"], ["secret_keyring", "keyring"], ["stripe_secret_key", "stripe-mock-key"], ["stripe_webhook_secret", "webhook-secret"]
    ]);
    expect(Object.keys(plan.files)).toEqual(["caddy/Caddyfile", "compose/cloud.override.yml", "compose/compose.env", "compose/service.compose.yml", "compose/sinks.compose.yml", "deployment.json", "env/commerce.json", "env/service.env"]);
  });

  it("plans production without sinks or a local certificate, with operator secrets never generated", () => {
    const plan = buildCloudPlan(productionConfig(), "0.1.0");
    expect(plan.composeFiles).toEqual(["compose/service.compose.yml", "compose/cloud.override.yml"]);
    expect(plan.services).toEqual(["fluxiq", "caddy"]);
    expect(plan.exportedCa).toBeNull();
    expect(plan.mailUi).toBeNull();
    expect(plan.secrets.filter((secret) => secret.generate === "operator").map((secret) => secret.file)).toEqual(["/etc/fluxiq-cloud/secrets/stripe-secret-key", "/etc/fluxiq-cloud/secrets/stripe-webhook-secret", "/etc/fluxiq-cloud/secrets/smtp-password"]);
    expect(plan.dockerfile).toBe("/opt/fluxiq/core/deploy/docker/Dockerfile");
  });

  it("labels every service, network, volume and the built image with the project", () => {
    const plan = buildCloudPlan(localConfig(), "0.1.0");
    const override = (plan.files["compose/cloud.override.yml"] as { content: string }).content;
    const sinks = (plan.files["compose/sinks.compose.yml"] as { content: string }).content;
    const label = 'com.fluxiq.cloud.project: "${FLUXIQ_CLOUD_PROJECT}"';
    expect(override.split(label).length - 1).toBe(8);
    for (const block of ["  fluxiq:\n    build:", "  caddy:\n    labels:", "  edge:\n    labels:", "  provisioning:\n    labels:", "  fluxiq-data:\n    labels:", "  caddy-data:\n    labels:", "  caddy-config:\n    labels:"]) expect(override).toContain(block);
    expect(sinks.split(label).length - 1).toBe(2);
    expect((plan.files["compose/compose.env"] as { content: string }).content).toContain("FLUXIQ_CLOUD_PROJECT=fluxiq-local\n");
  });

  it("mounts the secrets volume at /run/secrets in place of the base file's secrets, and writes no secret value", () => {
    const plan = buildCloudPlan(productionConfig(), "0.1.0");
    const override = (plan.files["compose/cloud.override.yml"] as { content: string }).content;
    for (const expected of ["    secrets: !reset []", '      - "secrets:/run/secrets:ro"', "  secrets:", "    external: true", '    name: "${FLUXIQ_CLOUD_PROJECT}_secrets"', "secrets: !reset {}"]) {
      expect(override.split(NL)).toContain(expected);
    }
    expect(plan.secretsVolume).toBe("fluxiq-production_secrets");
    const everything = Object.values(plan.files).map((file) => ("content" in file ? file.content : "")).join(NL);
    expect(everything).not.toMatch(/sk_(test|live)_|BEGIN .*PRIVATE KEY/u);
  });

  it("renders the commerce configuration Core reads beside the secrets and points Core at it, with no secret in it", () => {
    const local = buildCloudPlan(localConfig(), "0.1.0");
    const commerce = JSON.parse((local.files["env/commerce.json"] as { content: string }).content) as Record<string, unknown>;
    expect(commerce).toEqual({
      provider: "stripe", allowTrial: false, graceMs: 259_200_000, retentionMs: 2_592_000_000, refreshAfterMs: 3_600_000,
      plans: {
        browser: { priceId: "price_dedicated_browser_monthly", unit: "dedicated-browser", grants: [{ key: "cloud.dedicated", allocation: "dedicated", capabilities: ["execute"], regions: ["local"] }] },
        seat: { priceId: "price_team_seat_monthly", unit: "seat", grants: [{ key: "cloud.shared", allocation: "shared", capabilities: ["execute"], regions: ["local"] }] },
        shared: { priceId: "price_shared_monthly", unit: "flat", grants: [{ key: "cloud.shared", allocation: "shared", capabilities: ["execute"], regions: ["local"] }] }
      },
      secretKeyFile: "/run/secrets/stripe_secret_key", webhookSecretFile: "/run/secrets/stripe_webhook_secret", apiBaseUrl: "http://stripe-mock:12111"
    });
    expect(local.renderedFiles).toEqual([{ name: "commerce_config", bundlePath: "env/commerce.json", content: (local.files["env/commerce.json"] as { content: string }).content }]);
    const env = (local.files["env/service.env"] as { content: string }).content;
    expect(env).toContain("FLUXIQ_COMMERCE_CONFIG_FILE=/run/secrets/commerce_config" + NL);
    expect(env).not.toMatch(/FLUXIQ_STRIPE_/u);
    expect(env).toContain("FLUXIQ_SIGNUP=off" + NL);
    const production = JSON.parse((buildCloudPlan(productionConfig(), "0.1.0").files["env/commerce.json"] as { content: string }).content) as Record<string, unknown>;
    expect(production).not.toHaveProperty("apiBaseUrl");
    expect(production).toMatchObject({ secretKeyFile: "/run/secrets/stripe_secret_key", webhookSecretFile: "/run/secrets/stripe_webhook_secret" });
  });

  it("renders no commerce configuration when the config bills nothing", () => {
    const plan = buildCloudPlan({ ...localConfig(), billing: null }, "0.1.0");
    expect(plan.renderedFiles).toEqual([]);
    expect(Object.keys(plan.files)).not.toContain("env/commerce.json");
    expect(plan.secrets.map((secret) => secret.name)).not.toContain("stripe_webhook_secret");
    expect((plan.files["env/service.env"] as { content: string }).content).not.toContain("FLUXIQ_COMMERCE_CONFIG_FILE");
  });

  it("leaves apiBaseUrl and the Stripe key out of the fake provider's configuration", () => {
    const base = localConfig();
    const config = { ...base, billing: { ...base.billing!, provider: "fake" as const } };
    const commerce = JSON.parse((buildCloudPlan(config, "0.1.0").files["env/commerce.json"] as { content: string }).content) as Record<string, unknown>;
    expect(commerce).not.toHaveProperty("secretKeyFile");
    expect(commerce).not.toHaveProperty("apiBaseUrl");
    expect(commerce.webhookSecretFile).toBe("/run/secrets/stripe_webhook_secret");
  });

  it("renders FLUXIQ_SIGNUP from the signup setting", () => {
    const open = buildCloudPlan({ ...localConfig(), signup: "open" }, "0.1.0");
    expect((open.files["env/service.env"] as { content: string }).content).toContain("FLUXIQ_SIGNUP=open" + NL);
  });

  it("plans a self-hosted server: its own base file, no provisioning, no billing, no payments secrets", () => {
    const plan = buildCloudPlan(selfHostedConfig(), "0.1.0");
    expect(plan.composeFiles).toEqual(["compose/self-hosted.compose.yml", "compose/cloud.override.yml", "compose/sinks.compose.yml"]);
    expect(plan.services).toEqual(["fluxiq", "caddy", "mailpit"]);
    expect(plan.networks).toEqual({ edge: "fluxiq-selfhosted_edge", provisioning: null, runners: "fluxiq-selfhosted_runners" });
    expect(plan.secrets.map((secret) => [secret.name, secret.generate])).toEqual([["setup_code", "setup-code"]]);
    expect(plan.renderedFiles).toEqual([]);
    expect(Object.keys(plan.files)).toEqual(["caddy/Caddyfile", "compose/cloud.override.yml", "compose/compose.env", "compose/self-hosted.compose.yml", "compose/sinks.compose.yml", "deployment.json", "env/self-hosted.env"]);
    const env = (plan.files["env/self-hosted.env"] as { content: string }).content;
    expect(env).toContain("FLUXIQ_SETUP_CODE_FILE=/run/secrets/setup_code" + NL);
    expect(env).not.toMatch(/FLUXIQ_SIGNUP|FLUXIQ_COMMERCE_CONFIG_FILE|PROVISIONING/u);
    const composeEnv = (plan.files["compose/compose.env"] as { content: string }).content;
    expect(composeEnv).toContain("FLUXIQ_ENV_FILE=../env/self-hosted.env" + NL);
    expect(composeEnv).not.toContain("PROVISIONING");
    const override = (plan.files["compose/cloud.override.yml"] as { content: string }).content;
    expect(override).not.toContain("provisioning");
    expect(override).not.toContain("secrets: !reset {}");
    expect(override).toContain("    secrets: !reset []");
    expect(JSON.parse((plan.files["deployment.json"] as { content: string }).content)).toMatchObject({ mode: "self-hosted", composeFiles: plan.composeFiles });
  });

  it("serves the public origin on a non-default port when the config moves HTTPS", () => {
    const config = { ...localConfig(), ports: { http: 8080, https: 8443 } };
    expect(buildCloudPlan(config, "0.1.0").publicOrigin).toBe("https://app.fluxiq.localhost:8443");
  });
});
