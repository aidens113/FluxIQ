import { describe, expect, it } from "vitest";
import { parseAppInstallation, validateAppInstallationAgainstManifest } from "../../../apps.ts";
import { installationFixture, manifestFixture } from "../../tests/fixtures.ts";

describe("server-owned app installation metadata", () => {
  it("pins exact publisher/app/version and both digests without inferring upgrades", () => {
    const manifest = manifestFixture();
    const installation = installationFixture(manifest);
    expect(validateAppInstallationAgainstManifest(installation, manifest)).toEqual({ ok: true, value: installation });
    for (const field of ["publisherId", "appId", "version", "packageDigest", "manifestDigest"] as const) {
      const changed = { ...manifest, [field]: field.endsWith("Digest") ? "d".repeat(64) : field === "version" ? "1.3.0" : "other-id" };
      expect(validateAppInstallationAgainstManifest(installation, changed)).toMatchObject({ ok: false, error: { code: "app.installation_pin_mismatch" } });
    }
  });

  it("allows approved subsets and refuses grant or effect expansion", () => {
    const manifest = manifestFixture();
    const installation = installationFixture(manifest);
    expect(validateAppInstallationAgainstManifest({ ...installation, approvedGrants: [] }, manifest).ok).toBe(true);
    expect(validateAppInstallationAgainstManifest({ ...installation, approvedGrants: [{ capability: "automation.execute", bindingId: "prepare-order-v1", acts: ["change"] }] }, manifest).ok).toBe(true);
    for (const grant of [{ capability: "dataset.write", bindingId: "orders" }, { capability: "dataset.read", bindingId: "other-orders" }, { capability: "automation.execute", bindingId: "prepare-order-v1", acts: ["money"] }]) {
      expect(validateAppInstallationAgainstManifest({ ...installation, approvedGrants: [grant] }, manifest)).toMatchObject({ ok: false, error: { code: "app.grant_expansion" } });
    }
  });

  it("requires explicit target, environment and payer policy", () => {
    const installation = installationFixture();
    expect(parseAppInstallation({ ...installation, payer: { kind: "workspace", accountId: "account-1" } }).ok).toBe(false);
    const cloud = { ...installation, target: { kind: "managed-cloud", environment: "cloud", targetId: "cloud-1" } };
    expect(parseAppInstallation(cloud).ok).toBe(false);
    expect(parseAppInstallation({ ...cloud, payer: { kind: "publisher", accountId: "publisher-account" } }).ok).toBe(true);
    expect(parseAppInstallation({ ...cloud, payer: { kind: "workspace" } }).ok).toBe(false);
    expect(parseAppInstallation({ ...installation, target: { ...installation.target, environment: "cloud" } }).ok).toBe(false);
    const manifest = manifestFixture();
    manifest.requirements.environments = ["self-hosted"];
    expect(validateAppInstallationAgainstManifest(installation, manifest)).toMatchObject({ ok: false, error: { code: "app.invalid_installation" } });
  });

  it("does not require a compute payer for an existing-data-only cloud installation", () => {
    const installation = installationFixture();
    expect(parseAppInstallation({ ...installation, target: { kind: "managed-cloud", environment: "cloud", targetId: "cloud-1" }, approvedGrants: [{ capability: "dataset.read", bindingId: "orders" }] }).ok).toBe(true);
  });

  it("checks generation, revision, lifecycle times, revocation and unknown fields", () => {
    const installation = installationFixture();
    for (const patch of [{ generation: 0 }, { revision: 1.5 }, { updatedAtMs: 999 }, { installedAtMs: -1 }, { revokedAtMs: 1000 }, { status: "revoked" }, { status: "revoked", revokedAtMs: 999 }, { status: "revoked", revokedAtMs: 1001 }, { authorization: "owner" }]) {
      expect(parseAppInstallation({ ...installation, ...patch }).ok).toBe(false);
    }
    expect(parseAppInstallation({ ...installation, status: "revoked", revokedAtMs: 1000 }).ok).toBe(true);
    expect(parseAppInstallation({ ...installation, schemaVersion: 2 })).toMatchObject({ ok: false, error: { code: "app.unsupported_version" } });
  });

  it("never treats stored approvals as fresh caller, target or billing authority", () => {
    const installation = installationFixture();
    expect(parseAppInstallation({ ...installation, currentRole: "admin", accountAuthorized: true }).ok).toBe(false);
    expect(parseAppInstallation({ ...installation, app: { ...installation.app, verifiedPublisher: true } }).ok).toBe(false);
    expect(parseAppInstallation({ ...installation, approvedGrants: [{ capability: "secret.use", bindingId: "key-1", value: "DO-NOT-ECHO" }] })).toEqual({ ok: false, error: { code: "app.invalid_installation", message: "The app installation is not valid." } });
  });
});
