import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatCountdown } from "./shared";

describe("BackgroundTasksLive contract", () => {
  it("distinguishes scheduler, disabled, manual, due, and future countdown states", () => {
    expect(formatCountdown({ enabled: false, nextRunAtMs: 10 }, 0, true)).toBe("Stopped");
    expect(formatCountdown({ enabled: true, nextRunAtMs: 10 }, 0, false)).toBe("Paused");
    expect(formatCountdown({ enabled: true, nextRunAtMs: null }, 0, true)).toBe("Manual");
    expect(formatCountdown({ enabled: true, nextRunAtMs: 0 }, 0, true)).toBe("Manual");
    expect(formatCountdown({ enabled: true, nextRunAtMs: 1 }, 2, true)).toBe("Due now");
  });

  it("uses task-scoped bounded history and selected run detail", () => {
    const source = readFileSync(new URL("./background-tasks.tsx", import.meta.url), "utf8");
    expect(source).toContain('"detail"');
    expect(source).toContain("limit: 50");
    expect(source).toContain("offset, status: runFilter");
    expect(source).toContain("selectedRun");
    expect(source).toContain("Run Again");
    expect(source).not.toContain("recentRuns.map");
  });
});
