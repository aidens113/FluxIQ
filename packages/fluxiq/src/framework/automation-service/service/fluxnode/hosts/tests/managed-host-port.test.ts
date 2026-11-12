import { describe, expect, it } from "vitest";
import type { ClientGatewaySession } from "@fluxiq/contracts/client-gateway";
import { createFluxNodeManagedHostPort } from "../managed-host-port.ts";
import { AutomationStudioHostResourceScheduler } from "../../../../../../runtime/project-agents/host-resources/index.ts";

const session = (host: string, overrides: Partial<ClientGatewaySession> = {}): ClientGatewaySession => ({ sessionId: `session-${host}`, clientId: host, clientType: "extension", managedHostId: host, name: host, status: "ready", connectedAt: 1, lastSeenAt: 1, capabilities: [], metadata: { domainId: "web" }, ...overrides });

describe("FluxNode managed host port", () => {
  it("grants independent hosts concurrently, queues the next run and advances epochs on reuse", async () => {
    const sessions = [session("one"), session("two")];
    const scheduler = new AutomationStudioHostResourceScheduler(createFluxNodeManagedHostPort({ sessions: () => sessions, domainId: "web", capacity: 2, now: () => 10 }));
    const first = await scheduler.acquire({ role: "run", briefId: "one" });
    const second = await scheduler.acquire({ role: "run", briefId: "two" });
    expect(first.sessionId).not.toBe(second.sessionId);
    let thirdGranted = false;
    const third = scheduler.acquire({ role: "run", briefId: "three" }).then((lease) => {
      thirdGranted = true;
      return lease;
    });
    await Promise.resolve();
    expect(thirdGranted).toBe(false);
    await scheduler.release(first);
    const next = await third;
    expect(next.resourceKey).toBe(first.resourceKey);
    expect(next.epoch).toBeGreaterThan(first.epoch);
    expect(scheduler.isCurrent(first)).toBe(false);
    await scheduler.release(second);
    await scheduler.release(next);
  });

  it("does not grant disconnected, recording, wrong-domain or person-paired sessions", () => {
    const personal = session("personal");
    delete personal.managedHostId;
    const sessions = [session("closed", { status: "disconnected" }), session("recording", { activeRecordingId: "recording" }), session("other", { metadata: { domainId: "other" } }), personal];
    const port = createFluxNodeManagedHostPort({ sessions: () => sessions, domainId: "web", capacity: 2 });
    expect(port.acquire({ role: "run", briefId: "one" })).toBe("at_capacity");
  });
});
