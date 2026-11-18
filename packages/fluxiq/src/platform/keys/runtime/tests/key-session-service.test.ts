// @fluxiq-test-group real-sql
import { generateKeyPair, loadPrivateKeyText, signProof } from "@fluxiq/sdk";
import { afterEach, describe, expect, it } from "vitest";
import { createKeySessionService } from "../index.ts";
import { keySessionFixture } from "../../tests/key-session-fixture.ts";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

describe("enrolled key session service", () => {
  it("binds its authenticated IAM user to the enrolled workspace and lists only that binding", async () => {
    const f = await keySessionFixture(cleanups);
    const other = generateKeyPair();
    await f.service.enrollKey({ userId: "user-2", workspaceId: "workspace-1", publicKey: other.publicKeyBase64Url });
    const third = generateKeyPair();
    await f.service.enrollKey({ userId: f.binding.userId, workspaceId: "workspace-2", publicKey: third.publicKeyBase64Url });
    expect((await f.service.listKeys(f.binding)).map((key) => key.keyId)).toEqual([f.key.keyId]);
    const session = await f.service.exchange(f.proof());
    expect(session.expiresAt - session.serverTime).toBe(3_600_000);
    expect(await f.service.authenticate(session.sessionToken)).toEqual({
      principal: { type: "user", id: f.binding.userId, workspaceId: f.binding.workspaceId, frn: "frn:fluxiq:iam:workspace-1:user/user-1" },
      keyId: f.key.keyId,
      createdAtMs: f.state.nowMs,
      expiresAtMs: f.state.nowMs + 3_600_000
    });
    expect(f.eligibilityCalls.at(-1)).toEqual(f.binding);
    expect((await f.store.getKey(f.key.keyId))?.lastUsedAtMs).toBe(f.state.nowMs);
  });

  it("never enrolls a public key supplied by an unknown signed proof", async () => {
    const f = await keySessionFixture(cleanups);
    const other = generateKeyPair();
    const unknown = signProof({ key: loadPrivateKeyText(other.privateKeyPem, "test"), purpose: "session", audience: "https://app.example.com#instance-1", payload: "{}", now: new Date(f.state.nowMs) });
    await expect(f.service.exchange(unknown)).rejects.toMatchObject({ code: "key.unknown", status: 401 });
    expect(await f.store.getKey(other.keyId)).toBeNull();
    await expect(f.service.enrollKey({ userId: "another-user", workspaceId: f.binding.workspaceId, publicKey: f.pair.publicKeyBase64Url })).rejects.toMatchObject({ code: "key.bad_enrollment" });
  });

  it("refuses foreign origin/instance proofs and bearers, including services sharing the same database", async () => {
    const f = await keySessionFixture(cleanups);
    const proof = f.proof();
    await expect(f.service.exchange({ ...proof, aud: "https://evil.example#instance-1" })).rejects.toMatchObject({ code: "key.bad_audience" });
    await expect(f.service.exchange({ ...proof, aud: "https://app.example.com#instance-2" })).rejects.toMatchObject({ code: "key.bad_audience" });
    const session = await f.service.exchange(proof);
    await expect(f.serviceFor({ origin: "https://other.example" }).authenticate(session.sessionToken)).rejects.toMatchObject({ code: "key.unauthorized" });
    await expect(f.serviceFor({ store: f.openStore(), instanceId: "instance-2" }).authenticate(session.sessionToken)).rejects.toMatchObject({ code: "key.unauthorized" });
    expect((await f.service.authenticate(session.sessionToken)).keyId).toBe(f.key.keyId);
  });

  it("fails closed for disabled accounts, removed memberships and eligibility storage errors on both exchange and bearer authentication", async () => {
    const f = await keySessionFixture(cleanups);
    const session = await f.service.exchange(f.proof());
    f.state.eligible = false;
    await expect(f.service.exchange(f.proof())).rejects.toMatchObject({ code: "key.unauthorized" });
    await expect(f.service.authenticate(session.sessionToken)).rejects.toMatchObject({ code: "key.unauthorized" });
    f.state.eligible = true;
    f.state.eligibilityFails = true;
    await expect(f.service.exchange(f.proof())).rejects.toMatchObject({ code: "key.unauthorized", message: "The key credential could not be accepted." });
    await expect(f.service.authenticate(session.sessionToken)).rejects.toMatchObject({ code: "key.unauthorized" });
    f.state.eligibilityFails = false;
    const removedMembership = f.serviceFor({ eligible: async (binding) => binding.workspaceId !== f.binding.workspaceId });
    await expect(removedMembership.exchange(f.proof())).rejects.toMatchObject({ code: "key.unauthorized" });
    await expect(removedMembership.authenticate(session.sessionToken)).rejects.toMatchObject({ code: "key.unauthorized" });
  });

  it("rechecks key revocation after eligibility IO on issuance and authentication", async () => {
    const f = await keySessionFixture(cleanups);
    const session = await f.service.exchange(f.proof());
    const service = f.serviceFor({ eligible: async () => {
      await f.store.revokeKey(f.key.keyId, f.state.nowMs);
      return true;
    } });
    await expect(service.authenticate(session.sessionToken)).rejects.toMatchObject({ code: "key.unauthorized" });

    const next = generateKeyPair();
    await f.service.enrollKey({ userId: f.binding.userId, workspaceId: f.binding.workspaceId, publicKey: next.publicKeyBase64Url });
    const nextProof = signProof({ key: loadPrivateKeyText(next.privateKeyPem, "test"), purpose: "session", audience: "https://app.example.com#instance-1", payload: "{}", now: new Date(f.state.nowMs) });
    const issuance = f.serviceFor({ eligible: async () => {
      await f.store.revokeKey(next.keyId, f.state.nowMs);
      return true;
    } });
    await expect(issuance.exchange(nextProof)).rejects.toMatchObject({ code: "key.unknown" });
  });

  it("rechecks proof time after slow eligibility IO and rejects expired bearers", async () => {
    const f = await keySessionFixture(cleanups);
    const initial = f.proof();
    const slow = f.serviceFor({ eligible: async () => {
      f.state.nowMs += 301_000;
      return true;
    } });
    await expect(slow.exchange(initial)).rejects.toMatchObject({ code: "key.clock_skew", serverTime: f.state.nowMs + 301_000 });
    const session = await f.service.exchange(f.proof());
    f.state.nowMs = session.expiresAt - 1;
    await expect(f.service.authenticate(session.sessionToken)).resolves.toMatchObject({ keyId: f.key.keyId });
    f.state.nowMs += 1;
    await expect(f.service.authenticate(session.sessionToken)).rejects.toMatchObject({ code: "key.unauthorized" });
  });

  it("a bad signature cannot consume a valid proof's nonce, and bearer input is strict", async () => {
    const f = await keySessionFixture(cleanups);
    const proof = f.proof();
    await expect(f.service.exchange({ ...proof, sig: Buffer.alloc(64).toString("base64url") })).rejects.toMatchObject({ code: "key.bad_signature" });
    const session = await f.service.exchange(proof);
    for (const token of ["", "Bearer token", "fxs1.AA", `${session.sessionToken}=`, ` ${session.sessionToken}`]) {
      await expect(f.service.authenticate(token)).rejects.toMatchObject({ code: "key.unauthorized" });
    }
  });

  it("requires trusted eligibility, HTTPS except loopback, a stable instance id and a bounded session lifetime", async () => {
    const f = await keySessionFixture(cleanups);
    expect(() => createKeySessionService({
      store: f.store,
      origin: "https://app.example.com",
      instanceId: "instance-1",
      // @ts-expect-error A missing eligibility callback must fail both type checking and runtime validation.
      eligible: undefined
    })).toThrow("eligibility");
    for (const origin of ["http://app.example.com", "https://app.example.com/", "https://app.example.com/path", "https://name:password@app.example.com", "invalid"]) {
      expect(() => f.serviceFor({ origin })).toThrow("origin");
    }
    for (const instanceId of ["", "instance\n1", "instance#1", "_instance", "i".repeat(129)]) expect(() => f.serviceFor({ instanceId })).toThrow("instance");
    for (const sessionLifetimeMs of [NaN, Infinity, 899_999, 43_200_001, 900_000.5]) expect(() => f.serviceFor({ sessionLifetimeMs })).toThrow("fifteen minutes");
    for (const sessionLifetimeMs of [900_000, 43_200_000]) {
      const session = await f.serviceFor({ sessionLifetimeMs }).exchange(f.proof());
      expect(session.expiresAt - session.serverTime).toBe(sessionLifetimeMs);
    }
    expect(() => f.serviceFor({ origin: "http://127.0.0.1:3000" })).not.toThrow();
  });
});
