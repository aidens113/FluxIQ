// The deployment sync service.

import { describe, expect, it } from "vitest";

import { DeploymentSyncService } from "../deployment-sync/index.ts";

describe("global program services", () => {
  it("syncs deployment targets through an adapter", async () => {
    const service = new DeploymentSyncService({ sync: () => "synced" });
    await service.upsertTarget({ id: "prod", name: "Production", environment: "prod", status: "idle" });

    const run = await service.sync("prod");

    expect(run.status).toBe("synced");
    expect((await service.snapshot()).targets.find((target) => target.id === "prod")?.status).toBe("synced");
  });

});
