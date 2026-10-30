import { beforeEach, describe, expect, it, vi } from "vitest";

const readiness = vi.hoisted(() => ({ value: { ready: true } as { ready: boolean; reason?: string } }));
vi.mock("../../../../lib/fluxiq", () => ({ getFluxIQWebReadiness: () => readiness.value }));

import { GET } from "../route";

beforeEach(() => { readiness.value = { ready: true }; });

describe("GET /api/ready", () => {
  it("answers 200 when ready", async () => {
    const response = GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it.each(["starting", "draining", "gateway_not_listening"])("answers 503 with the reason %s and nothing else", async (reason) => {
    readiness.value = { ready: false, reason };
    const response = GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, reason });
  });
});
