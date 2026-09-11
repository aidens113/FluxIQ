// A disposable AutomationStudioService on a temporary data directory. Shared
// by the handler suites under api/handlers/tests/, which sit one level too
// deep to hold a non-test module of their own.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { AutomationStudioService } from "../../../runtime/index.ts";

export async function createCacheApiTestService(): Promise<{ service: AutomationStudioService; dataDir: string; cleanup: () => Promise<void> }> {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-automation-cache-api-"));
  const dataDir = path.join(rootDir, ".fluxiq", "data");
  const service = new AutomationStudioService({ dataDir, seedFixture: false });
  return {
    service,
    dataDir,
    cleanup: async () => {
      await service.close();
      await rm(rootDir, { recursive: true, force: true });
    }
  };
}
