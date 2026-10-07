import { expect, it, vi } from "vitest";
import { GlobalProgramApiRegistry } from "../../../../_shared/api.ts";
import { registerAutomationStudioApi } from "../index.ts";

it("registers build cancellation as authoring, scopes it by project/Flow, and enforces runtime.control", async () => {
  const registry = new GlobalProgramApiRegistry(), cancel = vi.fn(() => true);
  registerAutomationStudioApi(registry, { buildCancellation: { cancel } } as never);
  expect(registry.endpoints()).toContainEqual({ programId: "automation-studio", endpoint: "cancel-flow-bootstrap", permission: "runtime.control", classification: "authoring" });
  const request = { programId: "automation-studio", endpoint: "cancel-flow-bootstrap", scope: {},
    actor: { sessionId: "s", userId: "u", roleId: "admin", permissions: ["runtime.control" as const] }, payload: { projectId: "p", flowId: "f" } };
  expect(await registry.call(request)).toEqual({ ok: true, payload: { projectId: "p", flowId: "f", cancellationRequested: true } });
  expect(cancel).toHaveBeenCalledWith("p", "f");
  expect((await registry.call({ ...request, actor: { ...request.actor, permissions: [] } })).ok).toBe(false);
  expect((await registry.call({ ...request, payload: { projectId: "p" } })).ok).toBe(false);
  expect(cancel).toHaveBeenCalledTimes(1);
});
