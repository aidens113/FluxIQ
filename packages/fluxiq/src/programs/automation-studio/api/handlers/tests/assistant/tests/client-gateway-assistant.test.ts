// Covers the assistant declarations in handlers/client-gateway.ts: each exposed
// endpoint takes its input's minimal example.

import { describe, expect, it } from "vitest";

import { GlobalProgramApiRegistry } from "../../../../../../_shared/api.ts";
import { ClientGatewayService } from "../../../../../../../client-gateway/index.ts";
import { AUTOMATION_STUDIO_ENDPOINTS } from "../../../../../../../api-contracts/automation.ts";
import { registerAutomationStudioApi } from "../../../index.ts";
import { expectExampleAccepted } from "../assistant-example.ts";
import { callAcceptedExample } from "../run-example.ts";
import { createCacheApiTestService } from "../../test-service.ts";

describe("Client gateway endpoints for the panel assistant", () => {
  it("take the minimal example of each exposed input", async () => {
    const { service, cleanup } = await createCacheApiTestService();
    try {
      const registry = new GlobalProgramApiRegistry();
      registerAutomationStudioApi(registry, service, undefined, undefined, new ClientGatewayService());
      const E = AUTOMATION_STUDIO_ENDPOINTS;
      await expectExampleAccepted(registry, E.clientGatewaySnapshot, {});
      await expectExampleAccepted(registry, E.listClientGatewayItems, {});
      await expectExampleAccepted(registry, E.listClientGatewayItems, { kind: "trustedClients", limit: 10 });
      // No browser is trusted yet, so the handler refuses the id, not the input.
      const response = await callAcceptedExample(registry, E.revokeClientTrust, { trustedClientId: "trusted.none" });
      expect(response.ok).toBe(false);
      expect(response.error ?? "").toMatch(/not found/iu);
    } finally {
      await cleanup();
    }
  });
});
