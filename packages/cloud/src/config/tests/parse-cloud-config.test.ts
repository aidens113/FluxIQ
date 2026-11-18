import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CloudConfigError } from "../cloud-config-error.ts";
import { parseCloudConfig } from "../parse-cloud-config.ts";

const examples = fileURLToPath(new URL("../../../examples/", import.meta.url));
const localText = readFileSync(`${examples}local.config.json`, "utf8");
const productionText = readFileSync(`${examples}production.config.json`, "utf8");
const local = JSON.parse(localText) as Record<string, unknown>;
const production = JSON.parse(productionText) as Record<string, unknown>;

function issues(value: unknown): string[] {
  try {
    parseCloudConfig(JSON.stringify(value), "/configs/fluxiq-cloud.config.json");
  } catch (error) {
    if (error instanceof CloudConfigError) return error.issues.map((issue) => `${issue.path}: ${issue.message}`);
    throw error;
  }
  return [];
}

describe("parseCloudConfig", () => {
  it("accepts both shipped examples and applies defaults", () => {
    const config = parseCloudConfig(localText, `${examples}local.config.json`);
    expect(config).toMatchObject({
      project: "fluxiq-local", profile: "local", driver: "local-docker", domain: "app.fluxiq.localhost",
      ports: { http: 80, https: 443 }, tls: { mode: "internal", trustLocalCa: false },
      sinks: { mail: true, payments: true, mailUiPort: 8025 },
      email: { smtp: "smtp://mailpit:1025", username: null, passwordFile: null },
      payments: { apiBase: "http://stripe-mock:12111", secretKeyFile: null, webhookSecretFile: null },
      billing: { provider: "stripe", allowTrial: false, graceMs: 259_200_000, refreshAfterMs: 3_600_000, maxVerificationAgeMs: null, plans: { shared: { priceId: "price_shared_monthly", unit: "flat", grants: [{ key: "cloud.shared", allocation: "shared", capabilities: ["execute"], regions: ["local"] }] } } },
      mode: "service", signup: "off",
      images: { core: "fluxiq-cloud/core", caddy: "caddy:2.10-alpine" }
    });
    expect(config.sourceRoot).toMatch(/\/!FluxIQ$|\/[^/]+$/u);
    expect(config.stateDir.endsWith("/examples/.fluxiq/cloud/fluxiq-local")).toBe(true);
    expect(config.secretsDir).toBe(`${config.stateDir}/secrets`);
    expect(config.sourceRoot).not.toContain("\\");
    expect(() => parseCloudConfig(productionText, `${examples}production.config.json`)).not.toThrow();
  });

  it("keeps a server's absolute paths as written, whatever machine reads the config", () => {
    const config = parseCloudConfig(productionText, "C:/laptop/production.config.json");
    expect(config.sourceRoot).toBe("/opt/fluxiq/core");
    expect(config.stateDir).toBe("/var/lib/fluxiq-cloud/fluxiq-production");
    expect(config.secretsDir).toBe("/etc/fluxiq-cloud/secrets");
    expect(config.payments?.secretKeyFile).toBe("/etc/fluxiq-cloud/secrets/stripe-secret-key");
    expect(config.payments?.webhookSecretFile).toBe("/etc/fluxiq-cloud/secrets/stripe-webhook-secret");
    expect(config.email.passwordFile).toBe("/etc/fluxiq-cloud/secrets/smtp-password");
  });

  it("reports every schema problem at once, each with its path", () => {
    const found = issues({ ...local, project: "Bad Name", ports: { https: "443" }, tls: { mode: "letsencrypt", email: "nobody" }, extra: true, gateway: { allowedOrigins: [] } });
    expect(found).toEqual(expect.arrayContaining([
      expect.stringMatching(/^project: "Bad Name" is not valid here/u),
      "ports.https: must be a whole number",
      'tls.mode: must be one of "internal", "acme"',
      expect.stringMatching(/^tls\.email: "nobody" is not valid here/u),
      "extra: is not a known setting",
      "gateway.allowedOrigins: must list at least 1"
    ]));
    expect(found).toHaveLength(6);
  });

  it("names missing settings and suggests a near miss", () => {
    const { domain: _domain, ...withoutDomain } = local;
    expect(issues({ ...withoutDomain, Domain: "app.fluxiq.localhost" })).toEqual(["domain: is required", 'Domain: is not a known setting (did you mean "domain"?)']);
  });

  it("refuses text that is not JSON with the parser's reason", () => {
    expect(() => parseCloudConfig("{ project: ", "x.json")).toThrow(/x\.json is not a usable fluxiq-cloud config:\n {2}- \(the file\): is not valid JSON/u);
  });

  it("keeps a local rehearsal off real DNS, certificates, mail and money", () => {
    expect(issues({ ...local, tls: { mode: "acme", email: "a@b.example" } })).toEqual(['tls.mode: must be "internal" on the local profile: a rehearsal never asks a public certificate authority']);
    expect(issues({ ...local, domain: "app.example.org" })).toEqual(["domain: must end in .localhost on the local profile, so nothing reaches real DNS"]);
    expect(issues({ ...local, sinks: { mail: true, payments: false } })).toEqual(["payments.apiBase: must be https:// unless it is the stripe-mock sink", "payments.secretKeyFile: is required unless the stripe-mock sink runs", "payments.webhookSecretFile: is required with billing unless the stripe-mock sink runs: it is the signing secret of this endpoint"]);
    expect(issues({ ...local, sinks: { mail: false, payments: true } })).toEqual(["email.smtp: names the Mailpit sink, which runs only with sinks.mail on"]);
  });

  it("keeps a production config from carrying a rehearsal's sinks or unencrypted links", () => {
    expect(issues({ ...production, tls: { mode: "internal", email: "a@b.example" } })).toEqual(['tls.mode: must be "acme" on the production profile']);
    expect(issues({ ...production, domain: "app.fluxiq.localhost" })).toEqual(["domain: must be a public host name on the production profile"]);
    expect(issues({ ...production, sinks: { mail: true } })).toEqual(expect.arrayContaining(["sinks.mail: must be off on the production profile: mail goes to a real relay"]));
    expect(issues({ ...production, email: { from: "a@b.example", smtp: "smtp://smtp.example.org:25" } })).toEqual(["email.smtp: must be smtp+starttls:// or smtps:// on the production profile, so mail leaves encrypted"]);
    const { secrets: _secrets, ...withoutSecrets } = production;
    expect(issues(withoutSecrets)).toEqual(["secrets.dir: is required on the production profile: the server's secrets live where the operator keeps them"]);
  });

  it("checks the billing section: shape, plans, the fake provider's place, and the verification age", () => {
    const billing = local.billing as Record<string, unknown>;
    const plan = { priceId: "price_a", grants: [{ key: "cloud.shared", allocation: "shared", capabilities: ["execute"], regions: ["local"] }] };
    expect(issues({ ...local, billing: { ...billing, graceMs: -1, refreshAfterMs: "hourly", extra: 1 } })).toEqual(expect.arrayContaining([
      "billing.graceMs: must be at least 0", "billing.refreshAfterMs: must be a whole number", "billing.extra: is not a known setting"
    ]));
    const { plans: _plans, ...withoutPlans } = billing;
    expect(issues({ ...local, billing: withoutPlans })).toEqual(["billing.plans: is required"]);
    expect(issues({ ...local, billing: { ...billing, plans: {} } })).toEqual(["billing.plans: must name at least one plan"]);
    expect(issues({ ...local, billing: { ...billing, plans: { a: plan, b: plan } } })).toEqual(["billing.plans.b.priceId: is used by another plan"]);
    expect(issues({ ...local, billing: { ...billing, plans: { a: { priceId: "p", grants: [{ key: "k", allocation: "dedicated", capabilities: ["execute"] }] } } } })).toEqual(["billing.plans.a.grants[0].regions: must name a region unless the allocation is control"]);
    expect(issues({ ...local, billing: { ...billing, plans: { a: { priceId: "p", grants: [{ key: "k", allocation: "cluster", capabilities: ["execute"] }] } } } })).toEqual(['billing.plans.a.grants[0].allocation: must be one of "control", "shared", "dedicated"']);
    expect(issues({ ...local, billing: { ...billing, plans: { a: { priceId: "p", grants: [] } } } })).toEqual(["billing.plans.a.grants: must list at least 1"]);
    expect(issues({ ...local, billing: { ...billing, refreshAfterMs: 1000, maxVerificationAgeMs: 1000 } })).toEqual(["billing.maxVerificationAgeMs: must exceed billing.refreshAfterMs (1000): admission would refuse a subscription before it is due to be refreshed"]);
    expect(issues({ ...local, billing: { ...billing, provider: "fake" } })).toEqual([]);
    expect(issues({ ...production, billing: { ...(production.billing as Record<string, unknown>), provider: "fake" } })).toEqual(['billing.provider: must be "stripe" on the production profile: the fake provider takes no real money']);
    const { webhookSecretFile: _webhook, ...paymentsWithout } = production.payments as Record<string, unknown>;
    expect(issues({ ...production, payments: paymentsWithout })).toEqual(["payments.webhookSecretFile: is required with billing unless the stripe-mock sink runs: it is the signing secret of this endpoint"]);
    expect(issues({ ...local, payments: { ...(local.payments as Record<string, unknown>), webhookSecretFile: "whsec.txt" } })).toEqual(["payments.webhookSecretFile: is generated while the stripe-mock sink runs; leave it out"]);
    const { billing: _billing, ...unbilled } = production;
    expect(issues({ ...unbilled, payments: paymentsWithout })).toEqual([]);
  });

  it("prices per dedicated browser and per seat, plus a flat plan, as configuration", () => {
    const config = parseCloudConfig(localText, `${examples}local.config.json`);
    expect(Object.fromEntries(Object.entries(config.billing!.plans).map(([id, plan]) => [id, [plan.priceId, plan.unit]]))).toEqual({
      browser: ["price_dedicated_browser_monthly", "dedicated-browser"], seat: ["price_team_seat_monthly", "seat"], shared: ["price_shared_monthly", "flat"]
    });
    const billing = local.billing as Record<string, unknown>;
    const grants = [{ key: "cloud.shared", allocation: "shared", capabilities: ["execute"], regions: ["local"] }];
    expect(issues({ ...local, billing: { ...billing, plans: { a: { priceId: "p", unit: "device", grants } } } })).toEqual(['billing.plans.a.unit: must be one of "dedicated-browser", "seat", "flat"']);
    expect(issues({ ...local, billing: { ...billing, plans: { a: { priceId: "p", unit: "dedicated-browser", grants } } } })).toEqual(['billing.plans.a.grants: must include a dedicated grant: a "dedicated-browser" price counts dedicated browsers']);
    expect(parseCloudConfig(JSON.stringify({ ...local, billing: { ...billing, plans: { a: { priceId: "p", grants } } } }), "/c/x.json").billing!.plans.a?.unit).toBe("flat");
  });

  it("takes signup on a service only, off unless asked", () => {
    expect(parseCloudConfig(JSON.stringify({ ...local, signup: "open" }), "/c/x.json").signup).toBe("open");
    expect(issues({ ...local, signup: "everyone" })).toEqual(['signup: must be one of "off", "open"']);
  });

  it("describes a self-hosted server: the full base product, no billing, payments, provisioning or sign-up", () => {
    const selfHosted = JSON.parse(readFileSync(`${examples}self-hosted.config.json`, "utf8")) as Record<string, unknown>;
    const config = parseCloudConfig(JSON.stringify(selfHosted), `${examples}self-hosted.config.json`);
    expect(config).toMatchObject({ mode: "self-hosted", billing: null, payments: null, signup: "off", sinks: { mail: true, payments: false } });
    const { mode: _mode, ...asService } = selfHosted;
    expect(issues(asService)).toEqual(["payments: is required on a service: it names the payments API"]);
    expect(issues({ ...selfHosted, payments: { apiBase: "https://api.stripe.com" }, billing: local.billing, signup: "open", signUpUrl: "https://x.example", provisioning: { subnet: "10.9.0.0/24", address: "10.9.0.5" }, sinks: { mail: true, payments: true } })).toEqual([
      "payments: applies to a service only; a self-hosted server has none",
      "billing: applies to a service only; a self-hosted server has none",
      "signup: applies to a service only; a self-hosted server has none",
      "signUpUrl: applies to a service only; a self-hosted server has none",
      "provisioning: applies to a service only; a self-hosted server has none",
      "sinks.payments: applies to a service only; a self-hosted server has none",
      "payments.apiBase: must be http://stripe-mock:12111 while sinks.payments is on"
    ]);
  });

  it("checks fields that go together", () => {
    expect(issues({ ...production, email: { from: "a@b.example", smtp: "smtps://smtp.example.org", username: "u" } })).toEqual(["email: username and passwordFile go together"]);
    expect(issues({ ...local, tls: { mode: "internal", email: "a@b.example", trustLocalCa: true }, provisioning: { subnet: "10.9.0.0/24", address: "10.9.1.5" } })).toEqual(["provisioning.address: must be inside 10.9.0.0/24"]);
    expect(issues({ ...local, ports: { http: 8443, https: 8443 } })).toEqual(["ports: http and https need different ports"]);
    const reserved = "must not be 4000: that port belongs to NoMachine's remote-access server";
    expect(issues({ ...local, ports: { http: 4000, https: 443 } })).toEqual([`ports.http: ${reserved}`]);
    expect(issues({ ...local, ports: { http: 80, https: 4000 } })).toEqual([`ports.https: ${reserved}`]);
    expect(issues({ ...local, sinks: { mail: true, payments: true, mailUiPort: 4000 } })).toEqual([`sinks.mailUiPort: ${reserved}`]);
    expect(issues({ ...production, tls: { mode: "acme", email: "a@b.example", trustLocalCa: true } })).toEqual(['tls.trustLocalCa: applies only to tls.mode "internal"']);
  });
});
