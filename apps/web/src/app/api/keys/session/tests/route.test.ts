import { beforeEach, describe, expect, it, vi } from "vitest";
import { KeySessionError } from "fluxiq/platform";
import { getKeySessionService } from "../../../../../server/key-sessions";
import { POST } from "../route";

vi.mock("../../../../../server/key-sessions", async (importOriginal) => ({ ...await importOriginal<typeof import("../../../../../server/key-sessions")>(), getKeySessionService: vi.fn() }));
const exchange = vi.fn();
const request = (body = "{}", headers: Record<string, string> = {}) => new Request("https://app.example.test/api/keys/session", { method: "POST", headers: { "content-type": "application/json", "fluxiq-client": "sdk", ...headers }, body });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getKeySessionService).mockResolvedValue({ exchange } as unknown as Awaited<ReturnType<typeof getKeySessionService>>);
});

describe("web SDK session exchange", () => {
  it("returns the signed-proof exchange result without caching", async () => {
    exchange.mockResolvedValue({ sessionToken: "test-only-session", expiresAt: 123, serverTime: 12 });
    const response = await POST(request('{"v":1}'));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(exchange).toHaveBeenCalledWith({ v: 1 });
    expect(await response.json()).toEqual({ sessionToken: "test-only-session", expiresAt: 123, serverTime: 12 });
  });
  it("refuses invalid headers/body without opening authority", async () => {
    expect((await POST(request("{}", { "fluxiq-client": "browser" }))).status).toBe(400);
    expect((await POST(request("{"))).status).toBe(400);
    expect(getKeySessionService).not.toHaveBeenCalled();
  });
  it("preserves clock correction errors and hides internal errors", async () => {
    exchange.mockRejectedValue(new KeySessionError("key.clock_skew", 1000));
    let response = await POST(request());
    expect((await response.json()).error).toMatchObject({ code: "key.clock_skew", serverTime: 1000 });
    exchange.mockRejectedValue(new Error("private database path and credential"));
    response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private database");
  });
});
