// The person's current project and open Flow are one value (t1095, I5): the panel writes it on every
// switch, a paired client may write it for itself, and the client snapshot reads back whatever either
// wrote last. A client connected for one project keeps to it, refused in a sentence a person can act on.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runtime } from "../../../../../lib/workspaces/routes/tests/route-runtime";
import { resetSnapshotRuntime, snapshotRequest, snapshotRuntime } from "../../snapshot/tests/snapshot-runtime";
import { GET as snapshot } from "../../snapshot/route";
import { panelContextChanges } from "../../../panel/changes/topics";
import { POST } from "../route";
import { contextRequest } from "./request";

vi.mock("../../../../../lib/fluxiq", async () => {
  const { runtime } = await import("../../../../../lib/workspaces/routes/tests/route-runtime");
  const { snapshotRuntime } = await import("../../snapshot/tests/snapshot-runtime");
  return { getFluxIQWorkspaces: () => runtime.manager, getWorkspaceWebPresentation: runtime.presenter, getFluxIQWebRuntimeStatus: () => { throw new Error("Unexpected primary presentation"); }, isCurrentFluxIQPrimary: (instance: unknown) => snapshotRuntime.primaryCurrent && instance === runtime.primary };
});
vi.mock("../../../../../server/provisioning-listener", async () => {
  const { runtime } = await import("../../../../../lib/workspaces/routes/tests/route-runtime");
  return { getPlatformServices: async () => ({ store: runtime.store }) };
});
vi.mock("../../../../../server/browser-trust", async () => {
  const { runtime } = await import("../../../../../lib/workspaces/routes/tests/route-runtime");
  return { resolveServiceClientHttpRoute: runtime.resolveBrowser };
});

beforeEach(resetSnapshotRuntime);
afterEach(() => vi.unstubAllEnvs());

const PAIRED = { cookie: null, bearer: "browser-a-token" } as const;
const person = () => snapshotRuntime.owners.get("a")!.forCaller({ userId: "person-a" }).context();
const unbind = () => {
  if (!runtime.browserSession) throw new Error("Expected a browser");
  Object.assign(runtime.browserSession, { projectId: null });
};
async function seen(options: Parameters<typeof snapshotRequest>[0] = {}) {
  const response = await snapshot(snapshotRequest(options));
  expect(response.status).toBe(200);
  return (await response.json()).payload.webRuntime.automationStudio as { activeProjectId: string | null; activeFlowId: string | null };
}

describe("the person's one current project and Flow", () => {
  it("is what the panel wrote, read back by the client's snapshot", async () => {
    const written = await POST(contextRequest({ activeProjectId: "same-project", activeFlowId: null }));
    expect(written.status).toBe(200);
    expect(await seen(PAIRED)).toMatchObject({ activeProjectId: "same-project", activeFlowId: null });
    expect(await seen()).toMatchObject({ activeProjectId: "same-project", activeFlowId: null });
    const flow = await POST(contextRequest({ activeProjectId: "same-project", activeFlowId: "same-flow" }));
    expect(flow.status).toBe(200);
    expect(await seen(PAIRED)).toMatchObject({ activeProjectId: "same-project", activeFlowId: "same-flow" });
  });

  it("tells every open stream of the person's that the value changed, once the write committed, and nobody else's", async () => {
    const heard: string[] = [];
    const sink = (who: string) => ({ changed: () => heard.push(who), fail: () => undefined, opensAfter: () => undefined });
    const stops = [panelContextChanges.topic({ workspaceId: "tenant-a", userId: "person-a" }).start(sink("person-a")), panelContextChanges.topic({ workspaceId: "tenant-a", userId: "person-b" }).start(sink("person-b"))];
    unbind();
    expect((await POST(contextRequest({ activeProjectId: "same-project" }, PAIRED))).status).toBe(200);
    expect((await POST(contextRequest({ activeProjectId: "unknown-project" }))).status).toBe(403);
    expect(heard).toEqual(["person-a"]);
    for (const stop of stops) stop();
  });

  it("accepts a paired client's write for itself into the person's slot, which the panel then reads", async () => {
    unbind();
    snapshotRuntime.owners.get("a")!.forCaller({ userId: "person-a" }).beginContextWrite().commit({ activeProjectId: null });
    const response = await POST(contextRequest({ activeProjectId: " same-project ", activeFlowId: "same-flow" }, PAIRED));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, payload: { workspaceId: "tenant-a", automationStudio: { activeProjectId: "same-project", activeFlowId: "same-flow" } } });
    expect(body.payload).not.toHaveProperty("hostRoot");
    expect(person()).toMatchObject({ operatorUserId: "person-a", activeProjectId: "same-project", activeFlowId: "same-flow" });
    expect(person()).not.toHaveProperty("clientId");
    expect(runtime.presenter).toHaveBeenCalledWith("tenant-a", runtime.tenantA, { userId: "person-a", channel: "paired-client" });
    expect(await seen()).toMatchObject({ activeProjectId: "same-project", activeFlowId: "same-flow" });
    expect(runtime.releases.a).toHaveBeenCalled();
  });

  it("refuses a client connected for one project another one, or a clear, in a sentence, and changes nothing", async () => {
    snapshotRuntime.projects.get("a")!.push({ id: "other-project", name: "Other", domainId: "domain-a", ownerUserId: "person-a", updatedAt: 3 });
    for (const activeProjectId of ["other-project", null]) {
      const response = await POST(contextRequest({ activeProjectId }, PAIRED));
      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.ok).toBe(false);
      expect(body.error).toMatch(/^This browser was connected for one project only, so it cannot switch to another\./);
      expect(person()).toMatchObject({ activeProjectId: "same-project", activeFlowId: "same-flow" });
    }
    const own = await POST(contextRequest({ activeProjectId: "same-project", activeFlowId: null }, PAIRED));
    expect(own.status).toBe(200);
    expect(person()).toMatchObject({ activeProjectId: "same-project", activeFlowId: null });
  });

  it("refuses a paired client that names a clientId, and a project outside its own domain", async () => {
    unbind();
    const named = await POST(contextRequest({ activeProjectId: "same-project", clientId: "browser-a" }, PAIRED));
    expect(named.status).toBe(400);
    snapshotRuntime.projects.get("a")![0]!.domainId = "domain-other";
    const foreign = await POST(contextRequest({ activeProjectId: "same-project" }, PAIRED));
    expect(foreign.status).toBe(403);
    expect(person()).toMatchObject({ activeProjectId: "same-project", activeFlowId: "same-flow" });
  });
});
