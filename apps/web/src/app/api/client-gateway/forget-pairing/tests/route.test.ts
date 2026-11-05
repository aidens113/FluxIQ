import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ forgotten: [] as string[], answer: true }));

vi.mock("../../../../../lib/fluxiq", () => ({
  getFluxIQ: () => ({
    programs: {
      clientGateway: {
        ready: async () => undefined,
        access: {
          forgetByCredential: async (token: string) => {
            fixture.forgotten.push(token);
            return fixture.answer;
          }
        }
      }
    }
  })
}));

import { POST } from "../route";

function forget(authorization?: string): Promise<Response> {
  return POST(new Request("http://localhost/api/client-gateway/forget-pairing", { method: "POST", headers: authorization ? { authorization } : {} }));
}

describe("POST /api/client-gateway/forget-pairing", () => {
  beforeEach(() => {
    fixture.forgotten = [];
    fixture.answer = true;
  });

  it("refuses with no credential", async () => {
    const response = await forget();
    expect(response.status).toBe(401);
    expect(fixture.forgotten).toEqual([]);
  });

  it("ends the trust a credential speaks for", async () => {
    const response = await forget("Bearer dummy-credential");
    expect(response.status).toBe(200);
    expect(fixture.forgotten).toEqual(["dummy-credential"]);
    await expect(response.json()).resolves.toEqual({ ok: true, payload: { forgotten: true } });
  });

  it("answers the same for one that speaks for nobody, so the browser can stop asking", async () => {
    fixture.answer = false;
    const response = await forget("Bearer dummy-other");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, payload: { forgotten: false } });
  });
});
