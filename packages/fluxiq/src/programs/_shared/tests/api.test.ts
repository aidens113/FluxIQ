// The registry is the single place a program endpoint's credential regime is
// decided, so the classification behaviour is pinned here rather than in each
// program's own suite.

import { describe, expect, it, vi } from "vitest";
import { GlobalProgramApiRegistry } from "../api.ts";
import type { IdentityAccessService } from "../../identity-access/index.ts";
import type { Permission } from "../../identity-access/index.ts";

const actor = {
  sessionId: "session.one",
  userId: "user.one",
  roleId: "admin",
  permissions: ["programs.write"] as Permission[]
};

function identityAccessStub(authorizeSessionPin: (input: { sessionId?: string; pin?: string }) => Promise<unknown>): IdentityAccessService {
  return { authorizeSessionPin } as unknown as IdentityAccessService;
}

describe("global program API registry classification", () => {
  it("takes the operator's PIN before a destructive handler runs", async () => {
    const authorizeSessionPin = vi.fn().mockResolvedValue({ authorized: true });
    const handler = vi.fn().mockResolvedValue({ ok: true });
    const registry = new GlobalProgramApiRegistry({ identityAccess: identityAccessStub(authorizeSessionPin) });
    registry.register({ programId: "automation-studio", endpoint: "delete-thing", permission: "programs.write", classification: "destructive", handler });

    const response = await registry.call({
      programId: "automation-studio",
      endpoint: "delete-thing",
      scope: {},
      actor,
      payload: { authSessionId: "session.one", authorizationPin: "123456" }
    });

    expect(response).toMatchObject({ ok: true });
    expect(authorizeSessionPin).toHaveBeenCalledWith({ sessionId: "session.one", pin: "123456" });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("refuses a destructive endpoint that carries no PIN, without reaching the handler", async () => {
    const authorizeSessionPin = vi.fn().mockResolvedValue({ authorized: true });
    const handler = vi.fn().mockResolvedValue({ ok: true });
    const registry = new GlobalProgramApiRegistry({ identityAccess: identityAccessStub(authorizeSessionPin) });
    registry.register({ programId: "automation-studio", endpoint: "delete-thing", permission: "programs.write", classification: "destructive", handler });

    await expect(registry.call({ programId: "automation-studio", endpoint: "delete-thing", scope: {}, actor, payload: { authSessionId: "session.one" } }))
      .resolves.toMatchObject({ ok: false, error: "PIN is required for this action" });
    expect(handler).not.toHaveBeenCalled();
    expect(authorizeSessionPin).not.toHaveBeenCalled();
  });

  it("refuses a destructive endpoint when the wrong PIN is supplied", async () => {
    const authorizeSessionPin = vi.fn().mockRejectedValue(new Error("Authorization PIN is incorrect."));
    const handler = vi.fn().mockResolvedValue({ ok: true });
    const registry = new GlobalProgramApiRegistry({ identityAccess: identityAccessStub(authorizeSessionPin) });
    registry.register({ programId: "automation-studio", endpoint: "delete-thing", permission: "programs.write", classification: "destructive", handler });

    await expect(registry.call({ programId: "automation-studio", endpoint: "delete-thing", scope: {}, actor, payload: { authSessionId: "session.one", authorizationPin: "999999" } }))
      .resolves.toMatchObject({ ok: false, error: "Authorization PIN is incorrect." });
    expect(handler).not.toHaveBeenCalled();
  });

  it("fails a destructive endpoint closed when the registry holds no Identity Access", async () => {
    const handler = vi.fn().mockResolvedValue({ ok: true });
    const registry = new GlobalProgramApiRegistry();
    registry.register({ programId: "automation-studio", endpoint: "delete-thing", permission: "programs.write", classification: "destructive", handler });

    await expect(registry.call({ programId: "automation-studio", endpoint: "delete-thing", scope: {}, actor, payload: { authorizationPin: "123456" } }))
      .resolves.toMatchObject({ ok: false, error: "PIN authorization service is not available." });
    expect(handler).not.toHaveBeenCalled();
  });

  it("runs an authoring endpoint with no PIN, and never asks Identity Access for one", async () => {
    const authorizeSessionPin = vi.fn().mockResolvedValue({ authorized: true });
    const handler = vi.fn().mockResolvedValue({ ok: true });
    const registry = new GlobalProgramApiRegistry({ identityAccess: identityAccessStub(authorizeSessionPin) });
    registry.register({ programId: "automation-studio", endpoint: "save-thing", permission: "programs.write", classification: "authoring", handler });

    await expect(registry.call({ programId: "automation-studio", endpoint: "save-thing", scope: {}, actor, payload: {} }))
      .resolves.toMatchObject({ ok: true });
    expect(authorizeSessionPin).not.toHaveBeenCalled();
  });

  it("adds nothing to a program-gated or destructive-ungated endpoint, which answer to their own program", async () => {
    const authorizeSessionPin = vi.fn().mockResolvedValue({ authorized: true });
    const registry = new GlobalProgramApiRegistry({ identityAccess: identityAccessStub(authorizeSessionPin) });
    registry.register({ programId: "automation-studio", endpoint: "gated-thing", permission: "programs.write", classification: "program-gated", handler: () => ({ ok: true }) });
    registry.register({ programId: "automation-studio", endpoint: "ungated-thing", permission: "programs.write", classification: "destructive-ungated", handler: () => ({ ok: true }) });

    await expect(registry.call({ programId: "automation-studio", endpoint: "gated-thing", scope: {}, actor, payload: {} })).resolves.toMatchObject({ ok: true });
    await expect(registry.call({ programId: "automation-studio", endpoint: "ungated-thing", scope: {}, actor, payload: {} })).resolves.toMatchObject({ ok: true });
    expect(authorizeSessionPin).not.toHaveBeenCalled();
  });

  it("reports the classification of every registration", () => {
    const registry = new GlobalProgramApiRegistry();
    registry.register({ programId: "docs", endpoint: "read-thing", permission: "programs.read", classification: "read", handler: () => ({ ok: true }) });
    registry.register({ programId: "docs", endpoint: "write-thing", permission: "data.manage", classification: "authoring", handler: () => ({ ok: true }) });

    expect(registry.endpoints()).toEqual([
      { programId: "docs", endpoint: "read-thing", permission: "programs.read", classification: "read" },
      { programId: "docs", endpoint: "write-thing", permission: "data.manage", classification: "authoring" }
    ]);
  });

  it("checks the PIN after the permission, so an unauthorized caller learns nothing from the PIN gate", async () => {
    const authorizeSessionPin = vi.fn().mockResolvedValue({ authorized: true });
    const registry = new GlobalProgramApiRegistry({ identityAccess: identityAccessStub(authorizeSessionPin) });
    registry.register({ programId: "automation-studio", endpoint: "delete-thing", permission: "flows.write", classification: "destructive", handler: () => ({ ok: true }) });

    await expect(registry.call({ programId: "automation-studio", endpoint: "delete-thing", scope: {}, actor, payload: { authorizationPin: "123456" } }))
      .resolves.toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
    expect(authorizeSessionPin).not.toHaveBeenCalled();
  });
});
