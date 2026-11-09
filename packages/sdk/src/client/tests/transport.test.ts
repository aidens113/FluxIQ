import { fluxNodeListRunsResponseSchema, fluxNodeRunStateSchema } from "@fluxiq/contracts/fluxnode";
import { afterEach, describe, expect, it } from "vitest";
import { generateKeyPair, loadPrivateKeyText } from "../../keys/index.ts";
import { createSession } from "../../session/index.ts";
import { checkedListingsScenario } from "../../tests/fake-engine/checked-listings-scenario.ts";
import { startFakeEngine, type FakeEngine } from "../../tests/fake-engine/start-fake-engine.ts";
import { createTransport } from "../transport.ts";

let engine: FakeEngine | undefined;
afterEach(async () => {
  await engine?.close();
  engine = undefined;
});

describe("createTransport", () => {
  it("renews the session once when the engine says unauthenticated, then repeats the call", async () => {
    const pair = generateKeyPair();
    engine = await startFakeEngine({ scenario: checkedListingsScenario(), requireKey: true });
    engine.trust(loadPrivateKeyText(pair.privateKeyPem, "test").publicKeySpki.toString("base64url"));
    const session = createSession({ baseUrl: engine.url, credential: { key: loadPrivateKeyText(pair.privateKeyPem, "test"), explicit: true }, fetch });
    const transport = createTransport({ baseUrl: engine.url, session, fetch });
    await session.headers();
    engine.revokeSessions();
    const list = await transport.json({ method: "GET", path: "/api/fluxnode/v1/runs", answer: fluxNodeListRunsResponseSchema });
    expect(list).toEqual({ runs: [] });
    expect(engine.requests.filter((request) => request.path === "/api/keys/session")).toHaveLength(2);
  });

  it("says the engine is unreachable, and how to start it", async () => {
    engine = await startFakeEngine({ scenario: checkedListingsScenario() });
    const url = engine.url;
    await engine.close();
    engine = undefined;
    const session = createSession({ baseUrl: url, credential: undefined, fetch });
    const transport = createTransport({ baseUrl: url, session, fetch });
    await expect(transport.json({ method: "GET", path: "/api/fluxnode/v1/runs", answer: fluxNodeRunStateSchema })).rejects.toMatchObject({ code: "connection", hint: expect.stringContaining("fluxiq dev") });
  });

  it("refuses an answer that does not match the contracts", async () => {
    engine = await startFakeEngine({ scenario: checkedListingsScenario() });
    const transport = createTransport({ baseUrl: engine.url, session: createSession({ baseUrl: engine.url, credential: undefined, fetch }), fetch });
    await expect(transport.json({ method: "GET", path: "/api/fluxnode/v1/runs", answer: fluxNodeRunStateSchema })).rejects.toMatchObject({ code: "protocol" });
  });
});
