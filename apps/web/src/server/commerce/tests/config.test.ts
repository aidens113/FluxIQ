import { describe, expect, it } from "vitest";
import { commerceConfig } from "../config";

const plans = { shared: { priceId: "price_shared", grants: [{ key: "cloud.shared", allocation: "shared", capabilities: ["execute"], regions: ["region-a"] }] } };
const base = {
  provider: "stripe",
  allowTrial: false,
  graceMs: 259_200_000,
  retentionMs: 2_592_000_000,
  refreshAfterMs: 3_600_000,
  plans,
  secretKeyFile: "/run/secrets/stripe-key",
  webhookSecretFile: "/run/secrets/stripe-webhook"
};
const read = (value: unknown) => () => JSON.stringify(value);
const env = { FLUXIQ_COMMERCE_CONFIG_FILE: "/etc/fluxiq/commerce.json" };

describe("commerceConfig", () => {
  it("bills nothing when no configuration file is named", () => {
    expect(commerceConfig({}, () => {
      throw new Error("must not read");
    })).toBeNull();
  });

  it("reads the policy, plans and secret file paths, never secret values", () => {
    expect(commerceConfig(env, read({ ...base, apiBaseUrl: "http://127.0.0.1:12111/" }))).toEqual({
      provider: "stripe",
      allowTrial: false,
      graceMs: 259_200_000,
      retentionMs: 2_592_000_000,
      refreshAfterMs: 3_600_000,
      maxVerificationAgeMs: 7_200_000,
      plans: { shared: { name: "shared", lines: [{ ...plans.shared, unit: "flat", quantity: 1 }] } },
      secretKeyFile: "/run/secrets/stripe-key",
      webhookSecretFile: "/run/secrets/stripe-webhook",
      apiBaseUrl: "http://127.0.0.1:12111",
      checkoutLifetimeMs: 3_600_000,
      region: null
    });
    expect(commerceConfig(env, read({ ...base, maxVerificationAgeMs: 5_000_000 }))?.maxVerificationAgeMs).toBe(5_000_000);
    expect(commerceConfig(env, read({ ...base, provider: "fake", secretKeyFile: undefined }))).toMatchObject({ provider: "fake", secretKeyFile: null, apiBaseUrl: null });
  });

  it("reads what each price counts: a dedicated browser, a seat, or the whole plan", () => {
    const priced = {
      browser: { priceId: "price_browser", unit: "dedicated-browser", grants: [{ key: "cloud.dedicated", allocation: "dedicated", capabilities: ["execute"], regions: ["region-a"] }] },
      seat: { priceId: "price_seat", unit: "seat", grants: plans.shared.grants },
      team: { priceId: "price_team", grants: plans.shared.grants }
    };
    const read = commerceConfig(env, () => JSON.stringify({ ...base, plans: priced }));
    expect(Object.fromEntries(Object.entries(read!.plans).map(([id, plan]) => [id, plan.lines[0]!.unit]))).toEqual({ browser: "dedicated-browser", seat: "seat", team: "flat" });
    expect(read!.region).toBe("region-a");
  });

  it("reads a plan of several lines with their quantities, its name, the checkout lifetime and the region", () => {
    const dedicated = [{ key: "cloud.dedicated", allocation: "dedicated", capabilities: ["environment.dedicated"], regions: ["region-a"] }];
    const team = { name: "Team", lines: [{ priceId: "price_browser", unit: "dedicated-browser", quantity: 2, grants: dedicated }, { priceId: "price_seat", unit: "seat", quantity: 5, grants: plans.shared.grants }] };
    const read = commerceConfig(env, () => JSON.stringify({ ...base, plans: { team }, checkoutLifetimeMs: 1_800_000, region: "region-a" }));
    expect(read).toMatchObject({ checkoutLifetimeMs: 1_800_000, region: "region-a" });
    expect(read!.plans.team).toEqual({ name: "Team", lines: [{ ...team.lines[0], quantity: 2 }, { ...team.lines[1], quantity: 5 }] });
  });

  it.each([
    [{ provider: "paypal" }, /provider/u],
    [{ graceMs: -1 }, /graceMs/u],
    [{ refreshAfterMs: 0 }, /refreshAfterMs/u],
    [{ maxVerificationAgeMs: 3_600_000 }, /maxVerificationAgeMs \(3600000\) must exceed refreshAfterMs \(3600000\)/u],
    [{ maxVerificationAgeMs: 60_000 }, /maxVerificationAgeMs \(60000\) must exceed refreshAfterMs \(3600000\)/u],
    [{ maxVerificationAgeMs: 1.5 }, /maxVerificationAgeMs must be an integer/u],
    [{ allowTrial: "no" }, /allowTrial/u],
    [{ plans: {} }, /plans/u],
    [{ secretKeyFile: "" }, /secretKeyFile/u],
    [{ plans: { a: plans.shared, b: plans.shared } }, /which another line already sells/u],
    [{ plans: { a: { ...plans.shared, unit: "seat", quantity: 0 } } }, /plans.a.quantity must be an integer of at least 1/u],
    [{ plans: { a: { ...plans.shared, quantity: 2 } } }, /quantity must be 1 for a flat price/u],
    [{ plans: { a: { lines: [] } } }, /plans.a.lines must be a nonempty list/u],
    [{ checkoutLifetimeMs: 60_000 }, /checkoutLifetimeMs must be an integer of at least 1800000/u],
    [{ checkoutLifetimeMs: 90_000_000 }, /checkoutLifetimeMs must be at most/u],
    [{ plans: { a: { priceId: "p", unit: "dedicated-browser", grants: [{ key: "k", allocation: "dedicated", capabilities: ["x"], regions: ["r1", "r2"] }] } } }, /region must be named/u],
    [{ region: "elsewhere", plans: { a: { priceId: "p", unit: "dedicated-browser", grants: [{ key: "k", allocation: "dedicated", capabilities: ["x"], regions: ["r1"] }] } } }, /region elsewhere is not a region/u],
    [{ plans: { shared: { priceId: "p", grants: [{ key: "k", allocation: "shared", capabilities: ["execute"], regions: [] }] } } }, /regions/u],
    [{ plans: { shared: { priceId: "p", grants: [{ key: "k", allocation: "cluster", capabilities: ["execute"], regions: ["r"] }] } } }, /allocation/u],
    [{ provider: "fake", apiBaseUrl: "http://127.0.0.1:12111" }, /stripe provider only/u],
    [{ apiBaseUrl: "ftp://mock" }, /http or https/u],
    [{ plans: { a: { ...plans.shared, unit: "device" } } }, /plans.a.unit must be dedicated-browser, seat or flat/u],
    [{ plans: { a: { ...plans.shared, unit: "dedicated-browser" } } }, /plans.a.grants must include a dedicated grant/u]
  ])("refuses %j rather than guessing", (change, message) => {
    expect(() => commerceConfig(env, read({ ...base, ...change }))).toThrow(message);
  });

  it("names an unreadable file without echoing its contents", () => {
    expect(() => commerceConfig(env, () => "{ not json sk_live_secret")).toThrow(/could not be read as JSON \(SyntaxError\)/u);
    expect(() => commerceConfig(env, () => "{ not json sk_live_secret")).not.toThrow(/sk_live/u);
  });
});
