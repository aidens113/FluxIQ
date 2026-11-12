import { describe, expect, it } from "vitest";
import { ClientGatewaySessionRegistry } from "../../sessions.ts";
import { ClientGatewayManagedHostRuns } from "../managed-runs.ts";

describe("managed host run bindings", () => {
  it("takes authority only from managed trust and the live lease; release and revocation remove it", () => {
    const sessions = new ClientGatewaySessionRegistry(() => 1);
    const session = sessions.create({ hello: { clientId: "browser", clientType: "extension", name: "test", metadata: { domainId: "web" } } });
    session.status = "ready";
    session.trustedClientId = "trust";
    let trusted = true;
    let current = true;
    const runs = new ClientGatewayManagedHostRuns(sessions, () => trusted);
    const binding = { sessionId: session.sessionId, projectId: "p1", domainId: "web", runId: "r1",
      lease: { resourceKey: "host:one", epoch: 1, sessionId: session.sessionId, holder: { role: "fluxnode-run", briefId: "r1" } }, isCurrent: () => current };
    expect(() => runs.bind(binding)).toThrow("invalid_run_binding");
    session.managedHostId = "one";
    const release = runs.bind(binding);
    expect(runs.current(session.sessionId)?.projectId).toBe("p1");
    trusted = false;
    expect(runs.current(session.sessionId)).toBeUndefined();
    trusted = true;
    current = false;
    expect(runs.current(session.sessionId)).toBeUndefined();
    current = true;
    release();
    expect(runs.current(session.sessionId)).toBeUndefined();
    expect(session.projectId).toBeUndefined();
    const next = runs.bind({ ...binding, projectId: "p2", runId: "r2", lease: { ...binding.lease, epoch: 2 } });
    release();
    expect(runs.current(session.sessionId)?.projectId).toBe("p2");
    next();
  });

  it("refuses a wrong domain or another session's lease and never accepts hello metadata as trust", () => {
    const sessions = new ClientGatewaySessionRegistry(() => 1);
    const session = sessions.create({ hello: { clientId: "browser", clientType: "extension", name: "test", metadata: { domainId: "web", managedHostId: "forged" } } });
    session.status = "ready";
    session.trustedClientId = "trust";
    const runs = new ClientGatewayManagedHostRuns(sessions, () => true);
    const binding = { sessionId: session.sessionId, projectId: "p1", domainId: "web", runId: "r1",
      lease: { resourceKey: "host:one", epoch: 1, sessionId: session.sessionId, holder: { role: "fluxnode-run", briefId: "r1" } }, isCurrent: () => true };
    expect(() => runs.bind(binding)).toThrow("invalid_run_binding");
    session.managedHostId = "one";
    expect(() => runs.bind({ ...binding, domainId: "other" })).toThrow("invalid_run_binding");
    expect(() => runs.bind({ ...binding, lease: { ...binding.lease, sessionId: "other" } })).toThrow("invalid_run_binding");
  });
});
