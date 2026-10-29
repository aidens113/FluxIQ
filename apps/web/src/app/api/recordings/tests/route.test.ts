// The recordings list (t379): a paired client's token lists only the
// recordings of projects in the domain its pairing bound; a signed-in person's
// cookie lists as before.

import { beforeEach, describe, expect, it, vi } from "vitest";

const authorizeToken = vi.fn();
const listRecordingSummaries = vi.fn();
const requireFluxIQUser = vi.fn();

vi.mock("../../../../lib/auth", () => ({ requireFluxIQUser: () => requireFluxIQUser() }));
const snapshot = vi.fn();
// A real registry on the local profile decides the route, as live.
vi.mock("../../../../lib/fluxiq", async () => {
  const { GlobalProgramApiRegistry } = await import("fluxiq");
  const api = new GlobalProgramApiRegistry();
  return {
    getFluxIQ: () => ({
      programs: {
        api,
        identityAccess: { snapshot },
        clientGateway: { authorizeToken },
        automationStudio: { listRecordingSummaries },
      },
    }),
  };
});

import { GET } from "../route";

const TOKEN = "pairing-token-secret-value";
const PAGE = { items: [], page: 1, pageSize: 10, total: 0 };

function request(query = "", token: string | null = TOKEN) {
  return new Request(`http://127.0.0.1/api/recordings${query}`, token ? { headers: { authorization: `Bearer ${token}` } } : {});
}

beforeEach(() => {
  for (const mock of [authorizeToken, listRecordingSummaries, requireFluxIQUser, snapshot]) mock.mockReset();
  snapshot.mockResolvedValue({ users: [{ id: "user:owner", roleId: "role:admin", enabled: true }], roles: [{ id: "role:admin", permissions: ["programs.read", "runtime.control"] }] });
  authorizeToken.mockImplementation(async (token: string) => (token === TOKEN ? { sessionId: "g1", operatorUserId: "user:owner", metadata: { domainId: "web-automation" } } : null));
  listRecordingSummaries.mockResolvedValue(PAGE);
  requireFluxIQUser.mockResolvedValue(null);
});

describe("the recordings list", () => {
  it("lists a token's recordings from the projects of the domain its pairing bound", async () => {
    const response = await GET(request("?page=2&pageSize=5"));

    expect(response.status).toBe(200);
    expect(listRecordingSummaries).toHaveBeenCalledWith({ page: "2", pageSize: "5", domainId: "web-automation" });
    expect(await response.json()).toEqual(PAGE);
  });

  it("lists a token bound to no domain from projects with none", async () => {
    authorizeToken.mockResolvedValue({ sessionId: "g1", operatorUserId: "user:owner", metadata: {} });
    await GET(request());

    expect(listRecordingSummaries).toHaveBeenCalledWith({ page: undefined, pageSize: undefined, domainId: null });
  });

  it("refuses a token whose URL names another domain", async () => {
    const response = await GET(request("?domainId=desktop-automation"));

    expect(response.status).toBe(403);
    expect(listRecordingSummaries).not.toHaveBeenCalled();
  });

  it("lists a signed-in person's recordings as before, with no domain passed", async () => {
    requireFluxIQUser.mockResolvedValue({ session: { id: "session:person" }, user: { id: "user:person" }, role: { id: "role:viewer", permissions: ["programs.read"] } });
    const response = await GET(request("?page=1", null));

    expect(response.status).toBe(200);
    expect(listRecordingSummaries).toHaveBeenCalledWith({ page: "1", pageSize: undefined });
    expect(authorizeToken).not.toHaveBeenCalled();
  });

  it("falls back to the cookie for a token that speaks for no session, and refuses without either", async () => {
    requireFluxIQUser.mockResolvedValue({ session: { id: "session:person" }, user: { id: "user:person" }, role: { id: "role:viewer", permissions: ["programs.read"] } });
    expect((await GET(request("", "stale-token"))).status).toBe(200);
    expect(listRecordingSummaries).toHaveBeenLastCalledWith({ page: undefined, pageSize: undefined });

    requireFluxIQUser.mockResolvedValue(null);
    expect((await GET(request("", "stale-token"))).status).toBe(401);
  });
});
