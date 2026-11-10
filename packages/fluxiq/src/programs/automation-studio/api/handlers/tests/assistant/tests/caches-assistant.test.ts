// Covers the assistant declarations in handlers/caches.ts, diagnostics/runtime-identity.ts and task/known-flow.ts:
// each is internal and says why it hides.

import { describe, expect, it } from "vitest";

import { GlobalProgramApiRegistry } from "../../../../../../_shared/api.ts";
import { AUTOMATION_STUDIO_ENDPOINTS } from "../../../../../../../api-contracts/automation.ts";
import { registerAutomationStudioApi } from "../../../index.ts";

describe("Cache and internal endpoints for the panel assistant", () => {
  it("hide the editor's saved settings and the model-context cache, each with a reason", () => {
    const registry = new GlobalProgramApiRegistry();
    registerAutomationStudioApi(registry, {} as any);
    const E = AUTOMATION_STUDIO_ENDPOINTS;
    const cache = [E.getProjectUiCache, E.saveProjectUiCache, E.deleteProjectUiCache, E.listProjectUiCacheStats, E.getReusableLlmContextStatus, E.listReusableLlmContexts, E.getReusableLlmContext, E.putReusableLlmContext, E.deleteReusableLlmContext, E.clearReusableLlmContextScope, E.purgeExpiredReusableLlmContexts, E.packReusableLlmContexts];
    for (const endpoint of [...cache, E.runtimeBuildIdentity, E.getTaskKnownFlow]) {
      const declared = registry.endpoints().find((entry) => entry.endpoint === endpoint)?.assistant;
      expect(declared, endpoint).toEqual({ hidden: expect.stringMatching(/\S/) });
    }
  });
});
