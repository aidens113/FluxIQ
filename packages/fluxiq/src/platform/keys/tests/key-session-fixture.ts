import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { generateKeyPair, loadPrivateKeyText, signProof } from "@fluxiq/sdk";
import { createKeySessionService, createSQLiteKeyStore, type KeyBinding, type KeySessionServiceOptions, type KeyStore } from "../index.ts";

/** Real SQLite and the real SDK signer, with only account eligibility and clocks injected. */
export async function keySessionFixture(cleanups: Array<() => Promise<void>>) {
  const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-keys-"));
  const filePath = path.join(root, "keys.sqlite");
  const stores: KeyStore[] = [];
  const pair = generateKeyPair();
  const key = loadPrivateKeyText(pair.privateKeyPem, "test-only ephemeral key");
  const binding = { userId: "user-1", workspaceId: "workspace-1" };
  const state = { nowMs: Date.parse("2026-11-14T12:00:00Z"), eligible: true, eligibilityFails: false };
  const eligibilityCalls: KeyBinding[] = [];
  const eligible = async (candidate: KeyBinding) => {
    eligibilityCalls.push(candidate);
    if (state.eligibilityFails) throw new Error("private account store failure");
    return state.eligible;
  };
  const openStore = () => {
    const store = createSQLiteKeyStore({ filePath });
    stores.push(store);
    return store;
  };
  const store = openStore();
  const serviceFor = (overrides: Partial<KeySessionServiceOptions> = {}) => createKeySessionService({
    store: overrides.store ?? store,
    origin: overrides.origin ?? "https://app.example.com",
    instanceId: overrides.instanceId ?? "instance-1",
    eligible: overrides.eligible ?? eligible,
    sessionLifetimeMs: overrides.sessionLifetimeMs ?? 3_600_000,
    now: overrides.now ?? (() => state.nowMs)
  });
  const service = serviceFor();
  await service.enrollKey({ publicKey: pair.publicKeyBase64Url, userId: binding.userId, workspaceId: binding.workspaceId });
  const proof = () => signProof({ key, purpose: "session", audience: "https://app.example.com#instance-1", payload: "{}", now: new Date(state.nowMs) });
  cleanups.push(async () => {
    await Promise.all(stores.map((candidate) => candidate.close()));
    await rm(root, { recursive: true, force: true });
  });
  return { root, filePath, pair, key, binding, state, eligibilityCalls, store, service, serviceFor, openStore, proof };
}
