// The compute control service.

import { describe, expect, it } from "vitest";

import { ComputeControlService } from "../compute-control/index.ts";

describe("global program services", () => {
  it("tracks compute nodes, commands, and leases", async () => {
    const service = new ComputeControlService();
    await service.upsertNode({ id: "local", label: "Local", status: "online", domainIds: [], capabilities: ["flows"] });

    await service.enqueueCommand({ targetComputeId: "local", kind: "pause", nowMs: 1000 });
    await service.acquireLease({ computeId: "local", holder: "test", purpose: "run", ttlMs: 1000, nowMs: 1000 });

    const snapshot = await service.snapshot(1000);
    expect(snapshot.nodes).toHaveLength(1);
    expect(snapshot.commands).toHaveLength(1);
    expect(snapshot.leases).toHaveLength(1);
  });

});
