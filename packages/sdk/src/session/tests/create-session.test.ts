import { afterEach, describe, expect, it } from "vitest";
import { FluxNodeApiError } from "../../errors/index.ts";
import { generateKeyPair, loadPrivateKeyText } from "../../keys/index.ts";
import { checkedListingsScenario } from "../../tests/fake-engine/checked-listings-scenario.ts";
import { startFakeEngine, type FakeEngine } from "../../tests/fake-engine/start-fake-engine.ts";
import { createSession } from "../create-session.ts";

const engines: FakeEngine[] = [];

async function engineTrusting(pem: string | undefined, options: { clockOffsetMs?: number; keysUnsupported?: boolean; requireKey?: boolean } = {}): Promise<FakeEngine> {
  const engine = await startFakeEngine({ scenario: checkedListingsScenario(), ...options });
  if (pem !== undefined) engine.trust(loadPrivateKeyText(pem, "test").publicKeySpki.toString("base64url"));
  engines.push(engine);
  return engine;
}

afterEach(async () => {
  await Promise.all(engines.splice(0).map((engine) => engine.close()));
});

function sessionFor(engine: FakeEngine, pem: string | undefined, explicit = true) {
  const credential = pem === undefined ? undefined : { key: loadPrivateKeyText(pem, "test"), explicit };
  return createSession({ baseUrl: engine.url, credential, fetch });
}

describe("createSession", () => {
  it("in open mode adds only the client header and makes no request", async () => {
    const engine = await engineTrusting(undefined);
    const headers = await sessionFor(engine, undefined).headers();
    expect(headers).toEqual({ "FluxIQ-Client": "sdk" });
    expect(engine.requests).toHaveLength(0);
  });

  it("proves the key once and reuses the session", async () => {
    const pair = generateKeyPair();
    const engine = await engineTrusting(pair.privateKeyPem);
    const session = sessionFor(engine, pair.privateKeyPem);
    const first = await session.headers();
    const second = await session.headers();
    expect(first.authorization).toMatch(/^Bearer fxs1\./u);
    expect(second.authorization).toBe(first.authorization);
    expect(engine.requests.filter((request) => request.path === "/api/keys/session")).toHaveLength(1);
  });

  it("addresses the proof to the engine's origin and instance, and refuses an unknown key", async () => {
    const pair = generateKeyPair();
    const engine = await engineTrusting(undefined);
    const attempt = sessionFor(engine, pair.privateKeyPem).headers();
    await expect(attempt).rejects.toBeInstanceOf(FluxNodeApiError);
    await expect(attempt).rejects.toMatchObject({ apiCode: "key.unknown", status: 401 });
    const proof = engine.requests.find((request) => request.path === "/api/keys/session")?.body as { aud: string };
    expect(proof.aud).toBe(`${engine.url}#inst_fake`);
  });

  it("sets its clock from the engine's refusal and retries once", async () => {
    const pair = generateKeyPair();
    const engine = await engineTrusting(pair.privateKeyPem, { clockOffsetMs: 20 * 60_000 });
    const headers = await sessionFor(engine, pair.privateKeyPem).headers();
    expect(headers.authorization).toBeDefined();
    expect(engine.requests.filter((request) => request.path === "/api/keys/session")).toHaveLength(2);
  });

  it("goes unkeyed against an engine with no key endpoint only for the implicit default key", async () => {
    const pair = generateKeyPair();
    const engine = await engineTrusting(pair.privateKeyPem, { keysUnsupported: true });
    expect(await sessionFor(engine, pair.privateKeyPem, false).headers()).toEqual({ "FluxIQ-Client": "sdk" });
    await expect(sessionFor(engine, pair.privateKeyPem, true).headers()).rejects.toMatchObject({ status: 404 });
  });
});
