import { beforeEach, describe, expect, it, vi } from "vitest";
import { issueConnectCredential } from "../issue-credential";

const state = vi.hoisted(() => ({ approve: vi.fn(), count: vi.fn(), acquire: vi.fn(), issue: vi.fn(), release: vi.fn() }));
vi.mock("../approval", () => ({ validateConnectApproval: state.approve }));
vi.mock("../../browser-trust", () => ({ getBrowserTrustRepository: () => ({ countActiveForUser: state.count }) }));
vi.mock("../../../lib/fluxiq", () => ({
  getFluxIQAfterReload: async () => ({ paths: { fluxiq: "synthetic-platform-root" } }),
  getFluxIQWorkspaces: () => ({ acquire: state.acquire })
}));
const input = { userId: "person-one", workspaceId: "tenant-one", approvingSessionDigest: "a".repeat(64), clientId: "fluxiq-browser-extension" as const, clientInstallId: "installation-one", clientLabel: "Test client" };
beforeEach(() => {
  vi.resetAllMocks();
  state.approve.mockResolvedValue({ allowed: true, user: { userId: input.userId }, workspace: { workspaceId: input.workspaceId } });
  state.count.mockResolvedValue(0);
  state.acquire.mockResolvedValue({ release: state.release, fluxiq: { activeDomainId: "domain-one", domains: { summaries: () => [{ id: "domain-one" }] }, programs: { clientGateway: { trust: { issue: state.issue } } } } });
  state.issue.mockResolvedValue({ credential: "synthetic-issued-credential", credentialExpiresAt: 100_000, trustedClientId: "trust-one" });
});
describe("account-wide hosted connection admission", () => {
  it("maps the proved installation to gateway identity and counts all other account clients", async () => {
    expect(await issueConnectCredential(input)).toMatchObject({ connectedClientId: "trust-one" });
    expect(state.count).toHaveBeenCalledWith(input.userId, { workspaceId: input.workspaceId, clientId: input.clientInstallId, clientInstallId: input.clientInstallId });
    expect(state.issue).toHaveBeenCalledWith(expect.objectContaining({ clientId: input.clientInstallId, approvedByUserId: input.userId, approvingSessionDigest: input.approvingSessionDigest, domainId: "domain-one" }));
    expect(state.release).toHaveBeenCalledOnce();
  });
  it("refuses a changed tenant or actor before acquiring storage", async () => {
    state.approve.mockResolvedValue({ allowed: true, user: { userId: "someone-else" }, workspace: { workspaceId: input.workspaceId } });
    await expect(issueConnectCredential(input)).rejects.toMatchObject({ error: "invalid_grant" });
    expect(state.acquire).not.toHaveBeenCalled();
  });
  it("refuses an exhausted account limit before credential minting", async () => {
    state.count.mockResolvedValue(10);
    await expect(issueConnectCredential(input)).rejects.toMatchObject({ error: "client_limit_reached" });
    expect(state.acquire).not.toHaveBeenCalled();
    expect(state.issue).not.toHaveBeenCalled();
  });
  it("serializes simultaneous consents so two tenants cannot spend the same final account slot", async () => {
    let active = 9;
    let unblock!: () => void;
    const blocked = new Promise<void>((resolve) => { unblock = resolve; });
    state.count.mockImplementation(async () => active);
    state.approve.mockImplementation(async (digest: string) => ({ allowed: true, user: { userId: input.userId }, workspace: { workspaceId: digest === input.approvingSessionDigest ? "tenant-one" : "tenant-two" } }));
    state.issue.mockImplementationOnce(async () => {
      await blocked;
      active += 1;
      return { credential: "synthetic-issued-credential", credentialExpiresAt: 100_000, trustedClientId: "trust-one" };
    });
    const first = issueConnectCredential(input);
    await vi.waitFor(() => expect(state.issue).toHaveBeenCalledOnce());
    const second = issueConnectCredential({ ...input, workspaceId: "tenant-two", approvingSessionDigest: "b".repeat(64), clientInstallId: "installation-two" });
    const secondResult = second.catch((error: unknown) => error);
    expect(state.count).toHaveBeenCalledOnce();
    unblock();
    await first;
    expect(await secondResult).toMatchObject({ error: "client_limit_reached" });
    expect(state.issue).toHaveBeenCalledOnce();
  });
  it("releases its tenant on issuance failure and permits a later fresh consent", async () => {
    state.issue.mockRejectedValueOnce(new Error("issuance failed"));
    await expect(issueConnectCredential(input)).rejects.toThrow("issuance failed");
    expect(state.release).toHaveBeenCalledOnce();
    await issueConnectCredential(input);
    expect(state.release).toHaveBeenCalledTimes(2);
  });
});
