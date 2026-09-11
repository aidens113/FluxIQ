// The production runner service.

import { describe, expect, it } from "vitest";

import { ProductionRunnerService } from "../production-runner/index.ts";

describe("global program services", () => {
  it("starts and stops production runs", async () => {
    const service = new ProductionRunnerService();
    const run = await service.startRun({ name: "Demo", domainId: null, nowMs: 1000 });
    const stopped = await service.stopRun(run.id, 2000);

    expect(stopped.status).toBe("stopped");
    expect((await service.snapshot()).runs).toHaveLength(1);
  });
});
