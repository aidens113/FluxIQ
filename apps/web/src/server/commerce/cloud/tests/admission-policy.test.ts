import { describe, expect, it } from "vitest";
import { cloudAdmissionPolicy } from "../admission-policy";
import type { CommerceConfig } from "../../types";

const grant = (key: string, allocation: "control" | "shared" | "dedicated") => ({ key, allocation, capabilities: ["execute"], regions: allocation === "control" ? [] : ["region-a"] });
const plan = (priceId: string, grants: ReturnType<typeof grant>[]) => ({ name: priceId, lines: [{ priceId, unit: "flat" as const, quantity: 1, grants }] });
const config = (plans: CommerceConfig["plans"], overrides: Partial<CommerceConfig> = {}): CommerceConfig => ({
  provider: "stripe",
  allowTrial: true,
  graceMs: 259_200_000,
  retentionMs: 2_592_000_000,
  refreshAfterMs: 3_600_000,
  maxVerificationAgeMs: 7_200_000,
  plans,
  secretKeyFile: "/run/secrets/stripe_secret_key",
  webhookSecretFile: "/run/secrets/stripe_webhook_secret",
  apiBaseUrl: null,
  checkoutLifetimeMs: 3_600_000,
  region: "region-a",
  ...overrides
});

describe("cloudAdmissionPolicy", () => {
  it("takes grace, trial and verification age from the commerce configuration", () => {
    const policy = cloudAdmissionPolicy(config({ shared: plan("p1", [grant("cloud.shared", "shared")]) }));
    expect(policy).toMatchObject({ allowTrial: true, graceMs: 259_200_000, maxVerificationAgeMs: 7_200_000 });
  });

  it("uses the key the plans grant per class, and the conventional key for a class no plan grants", () => {
    const policy = cloudAdmissionPolicy(config({
      shared: plan("p1", [grant("acme.shared", "shared")]),
      pro: plan("p2", [grant("acme.shared", "shared"), grant("acme.dedicated", "dedicated")])
    }));
    expect(policy.entitlementKeys).toEqual({ control: "cloud.control", shared: "acme.shared", dedicated: "acme.dedicated" });
  });

  it("refuses a class granted under two keys rather than guessing", () => {
    expect(() => cloudAdmissionPolicy(config({
      a: plan("p1", [grant("one", "shared")]),
      b: plan("p2", [grant("two", "shared")])
    }))).toThrow(/shared under more than one key \(one, two\)/u);
  });

  it("refuses a verification age that does not exceed the refresh interval, naming both fields", () => {
    const plans = { shared: plan("p1", [grant("cloud.shared", "shared")]) };
    expect(() => cloudAdmissionPolicy(config(plans, { maxVerificationAgeMs: 3_600_000 }))).toThrow(/maxVerificationAgeMs \(3600000\) must exceed refreshAfterMs \(3600000\)/u);
  });
});
