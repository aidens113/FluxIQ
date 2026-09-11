// Covers handlers/client-gateway.ts.

import { describe, expect, it } from "vitest";

import { GlobalProgramApiRegistry } from "../../../../_shared/api.ts";
import { CLIENT_GATEWAY_PROTOCOL_VERSION, ClientGatewayService } from "../../../../../client-gateway/index.ts";

import { AUTOMATION_STUDIO_ENDPOINTS } from "../../contracts.ts";
import { cacheActor } from "./test-actor.ts";
import { createCacheApiTestService } from "./test-service.ts";
import { registerAutomationStudioApi } from "../index.ts";

describe("Automation Studio Client Gateway paging API", () => {
  it("returns summary counts and opaque stable pages capped by the handler", async () => {
    const { service, cleanup } = await createCacheApiTestService();
    const gateway = new ClientGatewayService();
    try {
      for (let index = 0; index < 125; index += 1) {
        const session = gateway.connect();
        await gateway.receive(session.sessionId, {
          protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION,
          id: `message.${index}`,
          type: "client.hello",
          timestamp: index + 1,
          payload: { clientId: `client-${String(index).padStart(4, "0")}`, clientType: "extension", name: `Client ${String(index).padStart(4, "0")}` }
        });
      }
      const registry = new GlobalProgramApiRegistry();
      registerAutomationStudioApi(registry, service, undefined, undefined, gateway);
      const snapshot = await registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.clientGatewaySnapshot, scope: {}, actor: cacheActor("user.gateway"), payload: {} });
      expect(snapshot.payload).toMatchObject({ counts: { sessions: 125, pairings: 125, trustedClients: 0 }, sessions: [], pairings: [], trustedClients: [] });

      const first = await registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.listClientGatewayItems, scope: {}, actor: cacheActor("user.gateway"), payload: { kind: "sessions", limit: 500 } });
      const firstPayload = first.payload as { items: Array<{ sessionId: string }>; page: { total: number; limit: number; nextCursor: string | null; hasMore: boolean } };
      expect(firstPayload.page).toMatchObject({ total: 125, limit: 200, hasMore: false });
      expect(firstPayload.items).toHaveLength(125);

      const pageOne = await registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.listClientGatewayItems, scope: {}, actor: cacheActor("user.gateway"), payload: { kind: "sessions", limit: 50 } });
      const one = pageOne.payload as typeof firstPayload;
      expect(one).toMatchObject({ page: { total: 125, limit: 50, hasMore: true } });
      expect(one.items).toHaveLength(50);
      const pageTwo = await registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.listClientGatewayItems, scope: {}, actor: cacheActor("user.gateway"), payload: { kind: "sessions", limit: 50, cursor: one.page.nextCursor } });
      const two = pageTwo.payload as typeof firstPayload;
      expect(two.items).toHaveLength(50);
      expect(new Set([...one.items, ...two.items].map((item) => item.sessionId)).size).toBe(100);

      const mismatched = await registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.listClientGatewayItems, scope: {}, actor: cacheActor("user.gateway"), payload: { kind: "sessions", limit: 50, search: "changed", cursor: one.page.nextCursor } });
      expect(mismatched).toMatchObject({ ok: false, error: expect.stringMatching(/does not match/) });
    } finally {
      await cleanup();
    }
  });
});
