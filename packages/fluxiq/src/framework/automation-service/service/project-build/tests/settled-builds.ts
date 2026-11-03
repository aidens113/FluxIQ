// A test's service and data directory, removed only once every build the test
// started has ended (t644). Under load a build can outlive the test that
// started it -- the per-test watchdog fires, vitest moves on to cleanup -- and
// removing the directory while that build still writes into it failed the
// cleanup with EBUSY or ENOTEMPTY, burying the real failure under a cascade
// (t616). Cleanup now stops each build still running through the service's own
// build cancellation, waits for every one to settle, closes the service, and
// only then removes the directory. A build that already ended is untouched.
import { rm } from "node:fs/promises";
import type { AutomationStudioService } from "../../../service.ts";

/** `track` each build as it starts; `cleanup` stops what is still running, waits for it, then closes and removes. */
export function automationStudioTestSettledBuilds(service: AutomationStudioService, dataDir: string) {
  const builds: Array<{ projectId: string; flowId: string; settled: Promise<unknown> }> = [];
  return {
    track<T>(projectId: string, flowId: string, build: Promise<T>): Promise<T> {
      builds.push({ projectId, flowId, settled: build.then(() => undefined, () => undefined) });
      return build;
    },
    async cleanup(): Promise<void> {
      for (const { projectId, flowId } of builds) service.buildCancellation.cancel(projectId, flowId);
      await Promise.all(builds.map((build) => build.settled));
      await service.close();
      await rm(dataDir, { recursive: true, force: true });
    }
  };
}
