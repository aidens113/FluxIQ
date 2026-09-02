import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createLargeAutomationStudioProjectFixture } from "../testing/large-project-fixture";
import { startClientRecording } from "./client-commands";
import { clientSelectionLocation, emptyClientGatewaySnapshot, retainSelectedSession, uniqueClientActionTypes } from "./client-model";
import { listClientGatewayItems } from "./client-queries";

describe("Client Gateway large-project behavior", () => {
  it("keeps a stable selection and deduplicates capabilities across thousands of sessions", () => {
    const fixture = createLargeAutomationStudioProjectFixture();
    expect(emptyClientGatewaySnapshot.sessions).toEqual([]);
    expect(retainSelectedSession(fixture.clients, "session.02047")).toBe("session.02047");
    expect(retainSelectedSession(fixture.clients, "missing")).toBe("session.00000");
    expect(uniqueClientActionTypes({ capabilities: fixture.clients.flatMap((client) => client.capabilities) })).toHaveLength(10);
  });

  it("preserves client authorization failures", async () => {
    const api = {
      get: vi.fn(),
      post: vi.fn().mockResolvedValue({ ok: false, error: "client.record permission required" })
    };
    await expect(startClientRecording(api, {
      sessionId: "session.00000", projectId: "project.large", authorizationPin: "1234"
    })).resolves.toEqual({ ok: false, error: "client.record permission required" });
  });

  it("distinguishes visible, off-page pinned, checking, and deleted selections", () => {
    const visibleSessions = [{ sessionId: "session.visible" }];
    expect(clientSelectionLocation({ selectedSessionId: "", visibleSessions })).toBe("none");
    expect(clientSelectionLocation({ selectedSessionId: "session.visible", visibleSessions })).toBe("visible");
    expect(clientSelectionLocation({ selectedSessionId: "session.pinned", visibleSessions, pinnedSessionId: "session.pinned", verifiedExists: null })).toBe("checking");
    expect(clientSelectionLocation({ selectedSessionId: "session.pinned", visibleSessions, pinnedSessionId: "session.pinned", verifiedExists: true })).toBe("off-page");
    expect(clientSelectionLocation({ selectedSessionId: "session.deleted", visibleSessions, pinnedSessionId: "session.deleted", verifiedExists: false })).toBe("missing");
  });

  it("sends server-side search/cursor pages and exposes retry without losing pinned selection", async () => {
    const post = vi.fn().mockResolvedValue({ ok: true, payload: { items: [], page: { total: 0 } } });
    await listClientGatewayItems({ get: vi.fn(), post } as any, { kind: "sessions", limit: 50, cursor: "cursor.2", search: "checkout" });
    expect(post).toHaveBeenCalledWith("list-client-gateway-items", { kind: "sessions", limit: 50, cursor: "cursor.2", search: "checkout" });
    const view = readFileSync(new URL("./ClientGatewayView.tsx", import.meta.url), "utf8");
    const controller = readFileSync(new URL("./useClientGatewayController.ts", import.meta.url), "utf8");
    expect(view).toContain("Search connected clients");
    expect(view).toContain(">Retry<");
    expect(view).toContain('selectedSessionLocation === "off-page"');
    expect(view).toContain('selectedSessionLocation === "missing"');
    expect(controller).toContain("setPinnedSession");
    expect(controller).toContain("session.sessionId === selectedSessionId");
  });
});
