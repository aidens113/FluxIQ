import { beforeEach, describe, expect, it, vi } from "vitest";
import { keyManagementContext } from "../management-context";
import { getKeySessionService } from "../service";
import { manageKeys } from "../management";

vi.mock("../management-context", () => ({ keyManagementContext: vi.fn() }));
vi.mock("../service", () => ({ getKeySessionService: vi.fn() }));
vi.mock("../config", () => ({ keySessionConfig: () => ({ origin: "https://app.example.test", instanceId: "test" }) }));
const enrollKey = vi.fn();
const listKeys = vi.fn();
const revokeKey = vi.fn();
function request(method: string, payload?: unknown, headers: Record<string, string> = {}) {
  return new Request("https://app.example.test/api/keys", { method, headers: { "content-type": "application/json", ...headers }, ...(payload === undefined ? {} : { body: JSON.stringify(payload) }) });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(keyManagementContext).mockResolvedValue({ userId: "alice", workspaceId: "ws-alice" });
  vi.mocked(getKeySessionService).mockResolvedValue({ enrollKey, listKeys, revokeKey } as unknown as Awaited<ReturnType<typeof getKeySessionService>>);
  listKeys.mockResolvedValue([{ keyId: "alice-key" }]);
  enrollKey.mockResolvedValue({ keyId: "new-key" });
});

describe("account-owned API key management", () => {
  it("enrolls only a public key for the authenticated owner", async () => {
    const response = await manageKeys(request("POST", { publicKey: "public-spki" }));
    expect(response.status).toBe(201);
    expect(enrollKey).toHaveBeenCalledWith({ publicKey: "public-spki", userId: "alice", workspaceId: "ws-alice" });
  });
  it.each([{ publicKey: "public-spki", userId: "bob" }, { privateKey: "never-accepted" }, { publicKey: "public-spki", workspaceId: "ws-bob" }])("refuses credential-owner injection or private material", async (payload) => {
    expect((await manageKeys(request("POST", payload))).status).toBe(400);
    expect(enrollKey).not.toHaveBeenCalled();
  });
  it("refuses cross-origin cookie writes even with an unrelated Bearer header", async () => {
    expect((await manageKeys(request("POST", { publicKey: "x" }, { origin: "https://evil.test", authorization: "Bearer unrelated" }))).status).toBe(403);
    expect((await manageKeys(request("DELETE", { keyId: "alice-key" }, { "sec-fetch-site": "cross-site" }))).status).toBe(403);
    expect(keyManagementContext).not.toHaveBeenCalled();
  });
  it("lists only the authenticated binding and refuses another owner's revocation", async () => {
    expect((await manageKeys(request("GET"))).status).toBe(200);
    expect(listKeys).toHaveBeenCalledWith({ userId: "alice", workspaceId: "ws-alice" });
    expect((await manageKeys(request("DELETE", { keyId: "bob-key" }))).status).toBe(404);
    expect(revokeKey).not.toHaveBeenCalled();
    expect((await manageKeys(request("DELETE", { keyId: "alice-key" }))).status).toBe(200);
    expect(revokeKey).toHaveBeenCalledWith("alice-key");
  });
  it("does not open key services without a valid panel identity", async () => {
    vi.mocked(keyManagementContext).mockResolvedValue(null);
    expect((await manageKeys(request("GET"))).status).toBe(401);
    expect(getKeySessionService).not.toHaveBeenCalled();
  });
});
