import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { computeNodeHealth } from "./compute-control";

describe("ComputeControlLive contract", () => {
  it("classifies current, stale, missing, and reported failure health", () => {
    expect(computeNodeHealth({ status: "online", lastHeartbeatMs: 900000 }, 1000000)).toBe("healthy");
    expect(computeNodeHealth({ status: "online", lastHeartbeatMs: 800000 }, 1000000)).toBe("degraded");
    expect(computeNodeHealth({ status: "online" }, 1000000)).toBe("offline");
    expect(computeNodeHealth({ status: "error", lastHeartbeatMs: 990000 }, 1000000)).toBe("degraded");
  });

  it("owns search, health, capability, detail, and activity states", () => {
    const source = readFileSync(new URL("./compute-control.tsx", import.meta.url), "utf8");
    expect(source).toContain("Search compute nodes");
    expect(source).toContain("Filter node health");
    expect(source).toContain("Filter node capability");
    expect(source).toContain("Active Leases");
    expect(source).toContain("No recent commands");
    expect(source).not.toContain("compute-card-grid");
  });
});
