import { afterEach, describe, expect, it, vi } from "vitest";
import { postSetup, setupMessage } from "../index";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("postSetup", () => {
  it("reads a success, a refusal with fields and a wait, and a network failure", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, redirectTo: "/" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, code: "rate_limited", retryAfterMs: 120_000 }), { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, code: "invalid_input", fields: ["username"] }), { status: 400 }))
      .mockRejectedValueOnce(new TypeError("offline"));
    vi.stubGlobal("fetch", fetch);
    expect(await postSetup({ code: "c" })).toEqual({ ok: true, redirectTo: "/" });
    expect(await postSetup({ code: "c" })).toEqual({ ok: false, code: "rate_limited", fields: [], retryAfterMs: 120_000 });
    expect(await postSetup({ code: "c" })).toEqual({ ok: false, code: "invalid_input", fields: ["username"] });
    expect(await postSetup({ code: "c" })).toEqual({ ok: false, code: "unreachable", fields: [] });
    expect(fetch.mock.calls[0]?.[0]).toBe("/setup/submit");
  });
});

describe("setupMessage", () => {
  it("says how long to wait and has a sentence for every refusal", () => {
    expect(setupMessage("rate_limited", 120_000)).toContain("2 minute(s)");
    for (const code of ["invalid_code", "setup_unavailable", "password_mismatch", "weak_password", "invalid_input", "username_taken", "claim_incomplete", "not_found", "sign_in_failed", "unreachable"]) {
      expect(setupMessage(code)).not.toBe(setupMessage("something-else"));
    }
  });
});
