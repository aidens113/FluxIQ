// @fluxiq-test-group real-sql
// Covers handle-program-request.ts with the real program runtime, its real free key check and its model-access
// ledger (t950): the provider is asked BEFORE a model key's value is stored, on every write that gives one a value
// (save-model-key and replace-model-key from the panel; create-key and rotate-key, which the panel's Settings use). A
// paired client's token writes no key (t1095: keys are the panel's), so its writes are refused before any provider is
// asked. Outcomes, by the provider's (stubbed) answer:
//
// - refused (401) or no credit (402): nothing is stored, the previous key and value stay in use, and the answer is a
//   refusal with that outcome as its code, which the panel shows in the form while keeping the typed key;
// - unreachable (the request fails): the key is saved, and the person's model access reads `provider_unreachable`;
// - answered (200): the key is saved and reads ready.
//
// `local` profile, dummy values; the stub is the only "provider", so nothing leaves the process.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FluxIQ } from "../../../framework/index.ts";
import type { GlobalProgramRuntime } from "../../../programs/index.ts";
import { RuntimeAccessFixture } from "../../../programs/_shared/tests/runtime-access-fixture.ts";
import { handleProgramRequest, type ProgramRouteRequest } from "../handle-program-request.ts";

type Answer = { status: number; raw: string; body: { ok: boolean; error?: string; errorCode?: string; payload?: any } };
type Provider = "answer" | "refuse" | "no-credit" | "unreachable";

const GOOD = "dummy-good-key-value";
const BAD = "dummy-bad-key-value";

let provider: Provider = "answer";
let fixture: RuntimeAccessFixture;
let runtime: GlobalProgramRuntime;
beforeEach(async () => {
  vi.stubEnv("FLUXIQ_PROFILE", "local");
  vi.stubEnv("FLUXIQ_SECRET_KEYS_KEYRING_FILE", "");
  provider = "answer";
  // The only provider there is: Anthropic's model list, answered as `provider` says. Nothing else is expected.
  vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
    if (!String(url).includes("anthropic.com")) throw new Error(`unexpected request to ${String(url)}`);
    if (provider === "unreachable") throw new TypeError("fetch failed");
    if (provider === "refuse") return new Response(JSON.stringify({ error: { type: "authentication_error" } }), { status: 401 });
    if (provider === "no-credit") return new Response(JSON.stringify({ error: { type: "billing_error" } }), { status: 402 });
    return new Response(JSON.stringify({ data: [] }), { status: 200 });
  }));
  fixture = await RuntimeAccessFixture.create();
  runtime = fixture.boot({ modelProvidersEnabled: true });
});
afterEach(async () => {
  try {
    await fixture.dispose();
  } finally {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  }
});

async function send(endpoint: string, body: unknown, caller: { token: string } | { cookie: string }): Promise<Answer> {
  const request: ProgramRouteRequest = {
    method: "POST",
    url: `http://127.0.0.1/api/programs/secret-keys/${endpoint}`,
    programId: "secret-keys",
    endpoint,
    sessionId: "cookie" in caller ? caller.cookie : undefined,
    authorization: "token" in caller ? `Bearer ${caller.token}` : null,
    readJson: async () => JSON.parse(JSON.stringify(body)),
  };
  const response = await handleProgramRequest(request, { fluxiq: { programs: runtime, activeDomainId: null } as unknown as FluxIQ });
  return { status: response.status, raw: response.body, body: JSON.parse(response.body) };
}

/** The signed-in person's model access, as the panel reads it. */
async function accessOf(cookie: string) {
  return (await send("snapshot", {}, { cookie })).body.payload?.modelAccess;
}

describe("the free check before a model key is stored, through the route", () => {
  it("refuses a paired client's model-key writes before the provider is asked, and stores nothing (t1095)", async () => {
    const login = await fixture.signIn(runtime);
    const token = { token: (await fixture.pair(runtime, login)).token };
    const asked = vi.mocked(fetch);
    asked.mockClear();
    for (const [endpoint, body] of [["save-model-key", { provider: "anthropic", value: GOOD }], ["replace-model-key", { value: GOOD }]] as const) {
      const answer = await send(endpoint, body, token);
      expect(answer.status, endpoint).toBe(403);
      expect(answer.body.error, endpoint).toBe("This endpoint is not available to a paired client.");
    }
    expect(asked).not.toHaveBeenCalled();
    expect((await runtime.secretKeys.snapshot()).keys).toEqual([]);
  });

  for (const via of ["panel"] as const) {
    describe(`from the ${via}`, () => {
      async function caller() {
        const login = await fixture.signIn(runtime);
        const cookie = login.session.id;
        return { cookie, as: { cookie } };
      }

      it.each([["refuse", "provider_refused"], ["no-credit", "no_credit"]] as const)("stores nothing when the provider says %s, and there was no key", async (answer, code) => {
        const { cookie, as } = await caller();
        provider = answer;
        const saved = await send("save-model-key", { provider: "anthropic", value: BAD }, as);
        expect(saved.status).toBe(400);
        expect(saved.body).toMatchObject({ ok: false, errorCode: code });
        expect(saved.raw).not.toContain(BAD);
        expect((await runtime.secretKeys.snapshot()).keys).toEqual([]);
        expect(await accessOf(cookie)).toMatchObject({ status: "no_key" });
      });

      it.each([["refuse", "provider_refused"], ["no-credit", "no_credit"]] as const)("keeps the previous key and value in use when the provider says %s to a save or a replace", async (answer, code) => {
        const { cookie, as } = await caller();
        expect((await send("save-model-key", { provider: "anthropic", value: GOOD, name: "Working" }, as)).status).toBe(200);
        const [working] = (await runtime.secretKeys.snapshot()).keys;
        expect(await accessOf(cookie)).toMatchObject({ status: "ready" });
        provider = answer;
        expect((await send("save-model-key", { provider: "anthropic", value: BAD, name: "Refused" }, as)).body).toMatchObject({ ok: false, errorCode: code });
        expect((await send("replace-model-key", { value: BAD }, as)).body).toMatchObject({ ok: false, errorCode: code });
        expect((await runtime.secretKeys.snapshot()).keys).toEqual([expect.objectContaining({ id: working!.id, name: "Working", lastRotatedAtMs: working!.lastRotatedAtMs })]);
        // Still ready on the working key: the refused value never became its last outcome either.
        expect(await accessOf(cookie)).toMatchObject({ status: "ready", key: { id: working!.id } });
      });

      it("saves the key when the provider cannot be reached, and reads Can't reach", async () => {
        const { cookie, as } = await caller();
        provider = "unreachable";
        const saved = await send("save-model-key", { provider: "anthropic", value: GOOD }, as);
        expect(saved.status, saved.body.error).toBe(200);
        expect(saved.body.payload.modelAccess).toMatchObject({ status: "provider_unreachable" });
        expect((await runtime.secretKeys.snapshot()).keys).toHaveLength(1);
        expect(await accessOf(cookie)).toMatchObject({ status: "provider_unreachable" });
      });
    });
  }

  it("refuses the panel's create-key and rotate-key the same way, and saves on an unreachable provider", async () => {
    const login = await fixture.signIn(runtime);
    const cookie = { cookie: login.session.id };
    const created = await send("create-key", { name: "Working", value: GOOD, kind: "llm", provider: "Anthropic" }, cookie);
    expect(created.status, created.body.error).toBe(200);
    const id = created.body.payload.id as string;
    const before = (await runtime.secretKeys.snapshot()).keys;
    provider = "refuse";
    expect((await send("create-key", { name: "Refused", value: BAD, kind: "llm", provider: "Anthropic" }, cookie)).body).toMatchObject({ ok: false, errorCode: "provider_refused" });
    expect((await send("rotate-key", { id, value: BAD }, cookie)).body).toMatchObject({ ok: false, errorCode: "provider_refused" });
    expect((await runtime.secretKeys.snapshot()).keys).toEqual(before);
    // A key no free check can test is stored as before, whatever the provider would say.
    expect((await send("create-key", { name: "Webhook", value: "dummy-webhook", kind: "custom" }, cookie)).status).toBe(200);
    provider = "unreachable";
    expect((await send("rotate-key", { id, value: `${GOOD}-next` }, cookie)).body).toMatchObject({ ok: true, payload: { modelAccess: { status: "provider_unreachable" } } });
  });
});
