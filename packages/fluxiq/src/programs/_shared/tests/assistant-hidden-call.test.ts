// An endpoint declared hidden from the panel assistant is never run for it:
// the registry enforces the declaration at the call, whatever a tool loop offers.

import { describe, expect, it, vi } from "vitest";
import { GlobalProgramApiRegistry } from "../api.ts";
import type { IdentityAccessService, Permission } from "../../identity-access/index.ts";

const actor = { sessionId: "session.one", userId: "user.one", roleId: "admin", permissions: ["programs.write"] as Permission[] };

function registryWith(handler: () => Promise<{ ok: true }>): GlobalProgramApiRegistry {
  const registry = new GlobalProgramApiRegistry({ identityAccess: {} as unknown as IdentityAccessService });
  registry.register({
    programId: "automation-studio",
    endpoint: "run-raw-command",
    permission: "programs.write",
    classification: "authoring",
    assistant: { hidden: "Only a connected client sends raw commands." },
    handler
  });
  return registry;
}

describe("a hidden endpoint and the assistant", () => {
  it("refuses an assistant call with the hidden reason and never runs the handler", async () => {
    const handler = vi.fn().mockResolvedValue({ ok: true });
    const response = await registryWith(handler).call({ programId: "automation-studio", endpoint: "run-raw-command", scope: {}, actor, payload: {}, via: "assistant" });
    expect(response).toEqual({ ok: false, error: "Only a connected client sends raw commands.", errorCode: "authorization.forbidden" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("still runs the same endpoint for the person's own call", async () => {
    const handler = vi.fn().mockResolvedValue({ ok: true });
    const response = await registryWith(handler).call({ programId: "automation-studio", endpoint: "run-raw-command", scope: {}, actor, payload: {} });
    expect(response.ok).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
