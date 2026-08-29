import { describe, expect, it, vi } from "vitest";
import { createLargeAutomationStudioProjectFixture } from "../testing/large-project-fixture";
import { startClientRecording } from "./client-commands";
import { emptyClientGatewaySnapshot, retainSelectedSession, uniqueClientActionTypes } from "./client-model";

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
});
