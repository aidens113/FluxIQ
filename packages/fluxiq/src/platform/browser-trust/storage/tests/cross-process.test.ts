// @fluxiq-test-group real-sql
import { afterEach, describe, expect, it } from "vitest";
import { browserTrustFixture } from "../../tests/browser-trust-fixture.ts";
import { competingBrowserTrustProcesses } from "./competing-store-processes.ts";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

describe("browser trust durable process isolation", () => {
  it("allows exactly one fresh-snapshot writer across eight actual competing processes", async () => {
    const f = await browserTrustFixture(cleanups);
    const outcomes = await competingBrowserTrustProcesses(f.filePath, "workspace.process-race");
    expect(outcomes.filter((outcome) => outcome === "saved")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome === "stale-generation")).toHaveLength(7);
    const records = await f.openRepository().scopedStore("workspace.process-race").load();
    expect(records).toHaveLength(1);
    expect(records[0]?.clientId).toBe("extension.synthetic-process");
  });
});
