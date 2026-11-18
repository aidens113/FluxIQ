// The hosted router for enrolment tickets re-checks its environment after the
// tenant opens and lets go of the tenant whenever it does not route.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EnvironmentRecord } from "fluxiq/platform";
import type { WorkspaceLease } from "../../../lib/workspaces";
import { resolveEnvironmentEnrolmentRoute } from "../resolve-enrolment-route";

const running: EnvironmentRecord = { environmentId: "env-a", accountId: "account-a", workspaceId: "tenant-a", driver: "fake", desired: "running", observed: "running", operationId: "op-1" };
const gateway = {} as WorkspaceLease["fluxiq"]["programs"]["clientGateway"];
const release = vi.fn();
const get = vi.fn<(environmentId: string) => Promise<EnvironmentRecord | null>>();
const lookup = vi.fn<(ticket: unknown) => { workspaceId: string; environmentId: string } | null>();
const acquire = vi.fn<(workspaceId: string) => Promise<WorkspaceLease>>();
const deps = { routes: { lookup }, store: { get }, primaryWorkspaceId: "workspace-main", acquire };
const lease = (workspaceId = "tenant-a") => ({ workspaceId, fluxiq: { programs: { clientGateway: gateway } }, release } as unknown as WorkspaceLease);

beforeEach(() => {
  vi.resetAllMocks();
  lookup.mockReturnValue({ workspaceId: "tenant-a", environmentId: "env-a" });
  get.mockResolvedValue(running);
  acquire.mockImplementation(async (workspaceId) => lease(workspaceId));
});

describe("enrolment ticket routes", () => {
  it("routes to the minting tenant and keeps its lease for the socket", async () => {
    const route = await resolveEnvironmentEnrolmentRoute({ ticket: "fxet_a", signal: new AbortController().signal }, deps);
    expect(route?.gateway).toBe(gateway);
    expect(acquire).toHaveBeenCalledWith("tenant-a");
    expect(release).not.toHaveBeenCalled();
    route?.release();
    expect(release).toHaveBeenCalledOnce();
  });
  it.each([
    ["a stopped environment", { ...running, desired: "stopped" as const }],
    ["a deleted environment", { ...running, desired: "deleted" as const, observed: "deleted" as const }],
    ["an environment of another workspace", { ...running, workspaceId: "tenant-b" }],
    ["a missing environment", null]
  ])("opens no tenant for %s", async (_label, record) => {
    get.mockResolvedValue(record);
    expect(await resolveEnvironmentEnrolmentRoute({ ticket: "fxet_a", signal: new AbortController().signal }, deps)).toBeNull();
    expect(acquire).not.toHaveBeenCalled();
  });
  it("releases the tenant when the environment stops while it opens", async () => {
    get.mockResolvedValueOnce(running).mockResolvedValueOnce({ ...running, desired: "stopped" });
    expect(await resolveEnvironmentEnrolmentRoute({ ticket: "fxet_a", signal: new AbortController().signal }, deps)).toBeNull();
    expect(release).toHaveBeenCalledOnce();
  });
  it("releases a tenant acquired after the socket closed, or one the manager answered for another workspace", async () => {
    const controller = new AbortController();
    acquire.mockImplementationOnce(async (workspaceId) => {
      controller.abort();
      return lease(workspaceId);
    });
    expect(await resolveEnvironmentEnrolmentRoute({ ticket: "fxet_a", signal: controller.signal }, deps)).toBeNull();
    acquire.mockImplementationOnce(async () => lease("tenant-b"));
    expect(await resolveEnvironmentEnrolmentRoute({ ticket: "fxet_a", signal: new AbortController().signal }, deps)).toBeNull();
    expect(release).toHaveBeenCalledTimes(2);
  });
  it("routes no unknown ticket and nothing to the primary workspace", async () => {
    lookup.mockReturnValueOnce(null).mockReturnValueOnce({ workspaceId: "workspace-main", environmentId: "env-a" });
    expect(await resolveEnvironmentEnrolmentRoute({ ticket: "fxet_unknown", signal: new AbortController().signal }, deps)).toBeNull();
    expect(await resolveEnvironmentEnrolmentRoute({ ticket: "fxet_primary", signal: new AbortController().signal }, deps)).toBeNull();
    expect(get).not.toHaveBeenCalled();
    expect(acquire).not.toHaveBeenCalled();
  });
});
