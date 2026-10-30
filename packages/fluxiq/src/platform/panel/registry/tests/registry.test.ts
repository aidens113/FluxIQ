import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { PanelProduct } from "@fluxiq/contracts/platform";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlatformProvisioning } from "../../../provisioning/index.ts";
import { createPlatformRegistry, getPlatformRegistry, resetPlatformRegistryForTests } from "../index.ts";

const PRODUCT: PanelProduct = { id: "demo", name: "Demo", shortName: "Demo", brand: { light: { primary: "#0b5cad", primaryHover: "#084a8a", focus: "#0b5cad" } } };
const PAYLOAD = { accountId: "acct-visible", userId: "u", workspaceId: "w" };

beforeEach(() => resetPlatformRegistryForTests());
afterEach(() => vi.restoreAllMocks());

describe("getPlatformRegistry", () => {
  it("returns one registry per process until reset", () => {
    const first = getPlatformRegistry();
    expect(getPlatformRegistry()).toBe(first);
    resetPlatformRegistryForTests();
    expect(getPlatformRegistry()).not.toBe(first);
  });
});

describe("setProduct", () => {
  it("stores a valid product and has no provisioning until attached", () => {
    const registry = createPlatformRegistry();
    registry.platform.setProduct(PRODUCT);
    expect(registry.product()).toEqual(PRODUCT);
    expect(registry.assetsDir()).toBeNull();
    expect(registry.platform.provisioning).toBeNull();
    const provisioning = {} as unknown as PlatformProvisioning;
    registry.attachProvisioning(provisioning);
    expect(registry.platform.provisioning).toBe(provisioning);
  });
  it("throws on an invalid manifest", () => {
    expect(() => createPlatformRegistry().platform.setProduct({ ...PRODUCT, surprise: 1 } as unknown as PanelProduct)).toThrow();
    expect(() => createPlatformRegistry().platform.setProduct({ ...PRODUCT, id: "Bad Id" })).toThrow();
  });
  it("refuses a brand that fails contrast", () => {
    const registry = createPlatformRegistry();
    expect(() => registry.platform.setProduct({ ...PRODUCT, brand: { light: { primary: "#999999", primaryHover: "#084a8a", focus: "#0b5cad" } } })).toThrow(/contrast/u);
    expect(registry.product()).toBeNull();
  });
  it("refuses a second call", () => {
    const registry = createPlatformRegistry();
    registry.platform.setProduct(PRODUCT);
    expect(() => registry.platform.setProduct(PRODUCT)).toThrow(/already set/u);
  });
  it("checks assetsDir and the declared asset files", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "fluxiq-panel-assets-"));
    try {
      const withLogo = { ...PRODUCT, assets: { logo: "logo.svg" } };
      expect(() => createPlatformRegistry().platform.setProduct(withLogo, { assetsDir: "relative/dir" })).toThrow(/absolute/u);
      expect(() => createPlatformRegistry().platform.setProduct(withLogo, { assetsDir: path.join(dir, "nope") })).toThrow(/existing directory/u);
      expect(() => createPlatformRegistry().platform.setProduct(withLogo, { assetsDir: dir })).toThrow(/logo\.svg/u);
      writeFileSync(path.join(dir, "logo.svg"), "<svg xmlns=\"http://www.w3.org/2000/svg\"/>");
      const registry = createPlatformRegistry();
      registry.platform.setProduct(withLogo, { assetsDir: dir });
      expect(registry.assetsDir()).toBe(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("hooks", () => {
  it("runs every handler in registration order", async () => {
    const registry = createPlatformRegistry();
    const order: number[] = [];
    registry.platform.on("account.created", async () => {
      await Promise.resolve();
      order.push(1);
    });
    registry.platform.on("account.created", () => void order.push(2));
    registry.platform.on("account.deleted", () => void order.push(99));
    await registry.emit("account.created", PAYLOAD);
    expect(order).toEqual([1, 2]);
  });
  it("isolates a throwing or rejecting handler and logs only the event and index", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const registry = createPlatformRegistry();
    const ran: string[] = [];
    registry.platform.on("account.created", () => {
      throw new Error("secret-detail");
    });
    registry.platform.on("account.created", async () => {
      throw new Error("rejected");
    });
    registry.platform.on("account.created", () => void ran.push("third"));
    await expect(registry.emit("account.created", PAYLOAD)).resolves.toBeUndefined();
    expect(ran).toEqual(["third"]);
    expect(logged).toHaveBeenCalledTimes(2);
    const text = logged.mock.calls.flat().join(" ");
    expect(text).toContain("account.created");
    expect(text).not.toContain("secret-detail");
    expect(text).not.toContain("acct-visible");
  });
});

describe("registrations", () => {
  const welcome = { subject: "Registered", text: "registered text" };
  const reset = { subject: "Registered 2", text: "other" };
  it("lets the manifest's template win over a registered one", () => {
    const registry = createPlatformRegistry();
    registry.platform.registerEmailTemplate("welcome", welcome);
    registry.platform.registerEmailTemplate("password-reset", reset);
    expect(registry.emailTemplates()).toEqual({ welcome, "password-reset": reset });
    registry.platform.setProduct({ ...PRODUCT, email: { sender: { name: "Demo", address: "hi@example.com" }, templates: { welcome: { subject: "Manifest", text: "manifest text" } } } });
    expect(registry.emailTemplates()).toEqual({ welcome: { subject: "Manifest", text: "manifest text" }, "password-reset": reset });
  });
  it("appends human checks and refuses a duplicate id", () => {
    const registry = createPlatformRegistry();
    const check = { id: "c1", verify: async () => true };
    registry.platform.registerHumanCheck(check);
    registry.platform.registerHumanCheck({ ...check, id: "c2" });
    expect(registry.humanChecks().map((entry) => entry.id)).toEqual(["c1", "c2"]);
    expect(() => registry.platform.registerHumanCheck(check)).toThrow(/already registered/u);
  });
  it("accepts one billing provider and one entitlement policy", () => {
    const registry = createPlatformRegistry();
    expect(registry.billingProvider()).toBeNull();
    expect(registry.entitlementPolicy()).toBeNull();
    registry.platform.registerBillingProvider({ id: "b" });
    registry.platform.registerEntitlementPolicy({ id: "e", allows: () => true });
    expect(registry.billingProvider()?.id).toBe("b");
    expect(registry.entitlementPolicy()?.id).toBe("e");
    expect(() => registry.platform.registerBillingProvider({ id: "b2" })).toThrow();
    expect(() => registry.platform.registerEntitlementPolicy({ id: "e2", allows: () => false })).toThrow();
  });
});
