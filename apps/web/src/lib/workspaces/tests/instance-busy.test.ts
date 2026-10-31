import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { FluxIQ } from "fluxiq";
import { describe, expect, it, vi } from "vitest";
import { instanceBusy } from "../instance-busy";

// What a real instance reports through `programs.activity()`: a background
// task running, or one a person turned on, pins it; the built-in maintenance
// task does not. Runs, builds and gateway sessions are read in
// `tenant-eviction.test.ts`.

describe("instanceBusy on a real instance", () => {
  it("counts a background task running or turned on by a person, never the maintenance queue", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "fluxiq-instance-busy-"));
    const fluxiq = FluxIQ.create({ rootDir: root, loadEnv: false, modelProvidersEnabled: false });
    try {
      await fluxiq.setup();
      const tasks = fluxiq.programs.backgroundTasks;
      expect(fluxiq.programs.activity()).toEqual({ openProjectDatabases: 0, backgroundTasksRunning: 0, backgroundTasksScheduled: 0, openGatewaySessions: 0 });
      expect(instanceBusy(fluxiq)).toBe(false);

      await tasks.setEnabled("docs.rebuild", true);
      expect(instanceBusy(fluxiq)).toBe(false);

      tasks.register({ id: "probe.report", name: "Report", queue: "default", enabled: false, intervalMs: 60_000 });
      await tasks.setEnabled("probe.report", true);
      expect(fluxiq.programs.activity().backgroundTasksScheduled).toBe(1);
      expect(instanceBusy(fluxiq)).toBe(true);
      await tasks.saveSchedule({ taskId: "probe.report", enabled: false });
      expect(instanceBusy(fluxiq)).toBe(false);

      let finish!: () => void;
      tasks.register({ id: "probe.once", name: "Once", queue: "default", enabled: true }, () => new Promise<void>((resolve) => { finish = resolve; }));
      const running = tasks.run("probe.once");
      await vi.waitFor(() => expect(fluxiq.programs.activity().backgroundTasksRunning).toBe(1));
      expect(instanceBusy(fluxiq)).toBe(true);
      finish();
      await expect(running).resolves.toMatchObject({ status: "succeeded" });
      expect(instanceBusy(fluxiq)).toBe(false);
    } finally {
      await fluxiq.close();
      try {
        rmSync(root, { recursive: true, force: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EBUSY") throw error;
      }
    }
  });
});
