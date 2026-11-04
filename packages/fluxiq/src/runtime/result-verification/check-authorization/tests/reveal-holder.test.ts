import { describe, expect, it } from "vitest";
import { revealAutomationStudioResultCheckSecret, type AutomationStudioResultCheckProviderPorts, type AutomationStudioResultCheckProviderScope } from "../index.ts";

// A standing authorization pays for a Flow's result checks from a person's own panel
// session. A browser's unlock pays only for what that browser asks for, so it can never be named here.

const scope: AutomationStudioResultCheckProviderScope = {
  projectId: "project.checks", flowId: "flow.catalogue", keyId: "key.one", unlockSessionId: "session.unlock.1", authorizedByUserId: "user.owner", maxEstimatedCostUsd: 0.05
};

function ports(minted: string[]): AutomationStudioResultCheckProviderPorts {
  return {
    getKeySummary: async (id) => ({ id, kind: "llm", enabled: true, updatedAtMs: 55 }),
    createSessionRevealAuthorization: async ({ sessionId }) => {
      minted.push(sessionId);
      return { authorizationId: "secret-reveal:1", keyId: "key.one", keyUpdatedAtMs: 55 };
    },
    revealKeyWithAuthorization: async () => ({ value: "dummy-provider-value" }),
    revokeRevealAuthorization: () => undefined
  };
}

const request = { projectId: scope.projectId, flowId: scope.flowId, outboundBody: "{}" };

describe("a result check's reveal", () => {
  it("refuses a paired browser's unlock, before asking for any reveal", async () => {
    const minted: string[] = [];
    await expect(revealAutomationStudioResultCheckSecret({ ports: ports(minted), scope: { ...scope, unlockSessionId: "paired-client:browser.one" }, request })).rejects.toThrow("paired browser");
    expect(minted).toEqual([]);
  });

  it("still draws on a panel session's", async () => {
    const minted: string[] = [];
    await expect(revealAutomationStudioResultCheckSecret({ ports: ports(minted), scope, request })).resolves.toBe("dummy-provider-value");
    expect(minted).toEqual(["session.unlock.1"]);
  });
});
