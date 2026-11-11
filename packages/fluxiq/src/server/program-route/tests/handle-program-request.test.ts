// @fluxiq-test-group real-sql
// Covers handle-program-request.ts with program-route.ts: a paired client's token on a Flow's humanness (t898), through the
// whole route, against the real registry and a real store, so what is refused is seen never to reach the handler or the Flow.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import type { FluxIQ } from "../../../framework/index.ts";
import { AutomationStudioService } from "../../../framework/automation-service/index.ts";
import { GlobalProgramApiRegistry } from "../../../programs/_shared/api.ts";
import { registerAutomationStudioApi } from "../../../programs/automation-studio/api/handlers/index.ts";
import { handleProgramRequest, type ProgramRouteRequest } from "../handle-program-request.ts";

const TOKEN = "pairing-token-secret-value";
const COOKIE = "panel-session";
const PERMISSIONS = ["programs.read", "programs.write", "runtime.control", "flows.write", "identity.manage", "data.manage"];

async function route() {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-paired-flow-humanness-"));
  const service = new AutomationStudioService({ dataDir: path.join(rootDir, ".fluxiq", "data"), seedFixture: false });
  // No Identity Access: nothing here is destructive or PIN-gated, so the registry never asks it.
  const registry = new GlobalProgramApiRegistry();
  registerAutomationStudioApi(registry, service);
  const call = vi.spyOn(registry, "call");
  const fluxiq = {
    programs: {
      api: registry,
      automationStudio: service,
      identityAccess: {
        validateSession: async (sessionId: string) => (sessionId === COOKIE ? { user: { id: "user:owner" }, role: { id: "role:admin", permissions: PERMISSIONS }, session: { expiresAtMs: Date.now() + 60_000 } } : null),
        snapshot: async () => ({ users: [{ id: "user:owner", roleId: "role:admin", enabled: true }], roles: [{ id: "role:admin", permissions: PERMISSIONS }] }),
      },
      clientGateway: { authorizeToken: async (token: string) => (token === TOKEN ? { sessionId: "g1", operatorUserId: "user:owner", metadata: {}, projectId: null } : null) },
      secretKeys: { credentialUnlocks: { presentPanelSession: async () => undefined } },
    },
  } as unknown as FluxIQ;
  const project = await service.createProject({ name: "Paired Flow humanness" });
  const flow = await service.createFlow({ projectId: project.id, name: "Humanness Flow", description: "As made" });
  const send = async (endpoint: string, body: unknown, caller: "token" | "cookie" = "token", method: "GET" | "POST" = "POST") => {
    const request: ProgramRouteRequest = {
      method,
      url: `http://127.0.0.1/api/programs/automation-studio/${endpoint}`,
      programId: "automation-studio",
      endpoint,
      sessionId: caller === "cookie" ? COOKIE : undefined,
      authorization: caller === "token" ? `Bearer ${TOKEN}` : null,
      readJson: async () => (body === undefined ? undefined : JSON.parse(JSON.stringify(body))),
    };
    const response = await handleProgramRequest(request, { fluxiq });
    return { status: response.status, raw: response.body, body: JSON.parse(response.body) as { ok: boolean; error?: string; errorCode?: string; payload?: any } };
  };
  // Input defaults, variable initial values and other settings beside the level, written through the real store, so the detail holds them.
  const seed = async (humanness?: number) => {
    const saved = await service.getFlow(project.id, flow.flowId);
    const metadata = { ...(saved.metadata ?? {}), llmModel: "model-do-not-leak", flowSizeSettings: { maxNodesPerSubflow: 150 }, ...(humanness === undefined ? {} : { humanness }) };
    await service.saveFlow({
      projectId: project.id,
      flow: {
        ...saved,
        description: "Description-do-not-leak",
        interface: { inputs: [{ id: "account", name: "account", valueType: { kind: "string" }, defaultValue: "ACCT-do-not-leak" }], outputs: [] },
        variables: [{ id: "token", name: "token", valueType: { kind: "string" }, initialValue: "VAR-do-not-leak" }],
        executionDefaults: { ...(saved.executionDefaults ?? {}) },
        metadata,
      },
    });
  };
  const change = (flowPatch: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ projectId: project.id, flowId: flow.flowId, flow: flowPatch, ...extra });
  const stored = async () => {
    const saved = await service.getFlow(project.id, flow.flowId);
    return { name: saved.name, description: saved.description, visibility: saved.visibility, updatedAt: saved.updatedAt, metadata: saved.metadata ?? {} };
  };
  const cleanup = async () => {
    await service.close();
    await rm(rootDir, { recursive: true, force: true });
  };
  return { project, flow, call, send, change, stored, seed, cleanup };
}

describe("a paired client on a Flow's humanness, through the program route", () => {
  it("reads a Flow's settings detail", async () => {
    const { flow, project, send, cleanup } = await route();
    try {
      const read = await send("get-flow-metadata-detail", { projectId: project.id, flowId: flow.flowId });
      expect(read.status, read.body.error).toBe(200);
      expect(read.body.payload.flow.flowId).toBe(flow.flowId);
      expect(read.body.payload.flow.metadata?.humanness).toBeUndefined();
    } finally { await cleanup(); }
  });

  it("answers a token's read with the Flow's id and level alone, never its defaults, initial values or other settings", async () => {
    const { flow, project, send, seed, call, cleanup } = await route();
    try {
      await seed(40);
      call.mockClear();
      const read = await send("get-flow-metadata-detail", { projectId: project.id, flowId: flow.flowId });
      expect(read.status, read.body.error).toBe(200);
      expect(read.body).toEqual({ ok: true, payload: { flow: { flowId: flow.flowId, metadata: { humanness: 40 } } } });
      // The handler did read the whole detail; the route cut it down on the way back.
      const handled = await call.mock.results[0]?.value;
      expect(JSON.stringify(handled)).toContain("ACCT-do-not-leak");
      expect(JSON.stringify(handled)).toContain("VAR-do-not-leak");
      for (const leaked of ["do-not-leak", "Humanness Flow", "maxNodesPerSubflow", "settings", "inputs", "variables"]) expect(read.raw, leaked).not.toContain(leaked);
    } finally { await cleanup(); }
  });

  it("answers a token's read of a Flow with no level as empty metadata", async () => {
    const { flow, project, send, seed, cleanup } = await route();
    try {
      await seed();
      const read = await send("get-flow-metadata-detail", { projectId: project.id, flowId: flow.flowId });
      expect(read.status, read.body.error).toBe(200);
      expect(read.body).toEqual({ ok: true, payload: { flow: { flowId: flow.flowId, metadata: {} } } });
    } finally { await cleanup(); }
  });

  it("refuses a token's read naming anything beside its project and Flow, before the handler runs", async () => {
    const { flow, project, send, call, cleanup } = await route();
    try {
      for (const field of ["flow", "includeInputs", "name"]) {
        const refused = await send("get-flow-metadata-detail", { projectId: project.id, flowId: flow.flowId, [field]: true });
        expect(refused.status, field).toBe(403);
        expect(refused.body).toEqual({ ok: false, errorCode: "authorization.forbidden", error: `A paired client's Flow settings read may not carry ${field}.` });
      }
      expect((await send("get-flow-metadata-detail", undefined, "token", "GET")).status).toBe(403);
      expect(call).not.toHaveBeenCalled();
    } finally { await cleanup(); }
  });

  it("answers a signed-in person's cookie read with the whole detail, exactly as the handler returned it", async () => {
    const { flow, project, send, seed, call, cleanup } = await route();
    try {
      await seed(40);
      call.mockClear();
      const read = await send("get-flow-metadata-detail", { projectId: project.id, flowId: flow.flowId, includeAnything: true }, "cookie");
      expect(read.status, read.body.error).toBe(200);
      const handled = await call.mock.results[0]?.value;
      expect(read.raw).toBe(JSON.stringify(handled));
      expect(read.body.payload.flow).toMatchObject({ flowId: flow.flowId, name: "Humanness Flow", description: "Description-do-not-leak", metadata: { humanness: 40 } });
      expect(read.body.payload.flow.inputs).toEqual([expect.objectContaining({ name: "account", defaultValue: "ACCT-do-not-leak" })]);
      expect(read.body.payload.flow.variables).toEqual([expect.objectContaining({ name: "token", initialValue: "VAR-do-not-leak" })]);
    } finally { await cleanup(); }
  });

  it("answers a token's level change with the same projection, so re-sending the level reads nothing the read withholds", async () => {
    const { flow, send, change, seed, call, cleanup } = await route();
    try {
      await seed(40);
      call.mockClear();
      const set = await send("update-flow-settings", change({ metadata: { humanness: 40 } }));
      expect(set.status, set.body.error).toBe(200);
      expect(set.body).toEqual({ ok: true, payload: { flow: { flowId: flow.flowId, metadata: { humanness: 40 } } } });
      expect(JSON.stringify(await call.mock.results[0]?.value)).toContain("ACCT-do-not-leak");
      for (const leaked of ["do-not-leak", "Humanness Flow", "maxNodesPerSubflow"]) expect(set.raw, leaked).not.toContain(leaked);
      const cleared = await send("update-flow-settings", change({ metadata: { humanness: null } }));
      expect(cleared.body).toEqual({ ok: true, payload: { flow: { flowId: flow.flowId, metadata: {} } } });
    } finally { await cleanup(); }
  });

  it("answers a signed-in person's cookie settings change with the whole detail, exactly as the handler returned it", async () => {
    const { send, change, seed, call, cleanup } = await route();
    try {
      await seed(40);
      call.mockClear();
      const set = await send("update-flow-settings", change({ metadata: { humanness: 30 } }), "cookie");
      expect(set.status, set.body.error).toBe(200);
      expect(set.raw).toBe(JSON.stringify(await call.mock.results[0]?.value));
      expect(set.raw).toContain("ACCT-do-not-leak");
      expect(set.raw).toContain("VAR-do-not-leak");
    } finally { await cleanup(); }
  });

  it("sets humanness 40, reads it back, and clears it with null", async () => {
    const { flow, project, send, change, stored, cleanup } = await route();
    try {
      const set = await send("update-flow-settings", change({ flowId: flow.flowId, metadata: { humanness: 40 } }));
      expect(set.status, set.body.error).toBe(200);
      expect(set.body.payload.flow.metadata.humanness).toBe(40);
      expect((await stored()).metadata.humanness).toBe(40);
      const read = await send("get-flow-metadata-detail", { projectId: project.id, flowId: flow.flowId });
      expect(read.body.payload.flow.metadata.humanness).toBe(40);

      const cleared = await send("update-flow-settings", change({ metadata: { humanness: null } }));
      expect(cleared.status, cleared.body.error).toBe(200);
      expect("humanness" in (await stored()).metadata).toBe(false);
      const reread = await send("get-flow-metadata-detail", { projectId: project.id, flowId: flow.flowId });
      expect(reread.body.payload.flow.metadata?.humanness).toBeUndefined();
    } finally { await cleanup(); }
  });

  it("leaves the level's bounds to the handler, which refuses one no run could use", async () => {
    const { send, change, stored, cleanup } = await route();
    try {
      await send("update-flow-settings", change({ metadata: { humanness: 40 } }));
      const refused = await send("update-flow-settings", change({ metadata: { humanness: 101 } }));
      expect(refused.body.ok).toBe(false);
      expect(refused.body.error).toContain("humanness");
      expect((await stored()).metadata.humanness).toBe(40);
    } finally { await cleanup(); }
  });

  it.each([
    ["flow.metadata.flowSizeSettings", { metadata: { humanness: 70, flowSizeSettings: { maxNodesPerSubflow: 500 } } }, {}],
    ["flow.name", { name: "Renamed by token", metadata: { humanness: 70 } }, {}],
    ["flow.description", { description: "Rewritten by token", metadata: { humanness: 70 } }, {}],
    ["expectedUpdatedAt", { metadata: { humanness: 70 } }, { expectedUpdatedAt: 1 }],
    ["visibility", { metadata: { humanness: 70 } }, { visibility: "public" }],
    ["flow.metadata.humanness", { metadata: {} }, {}],
    ["flow.flowId", { flowId: "flow.other", metadata: { humanness: 70 } }, {}],
  ])("refuses %s before the handler runs, with the code and the field named, and stores nothing", async (field, flowPatch, extra) => {
    const { send, change, stored, call, cleanup } = await route();
    try {
      await send("update-flow-settings", change({ name: "As named", description: "As described", metadata: { flowSizeSettings: { maxNodesPerSubflow: 150 } } }), "cookie");
      await send("update-flow-settings", change({ metadata: { humanness: 40 } }));
      const before = await stored();
      call.mockClear();
      const refused = await send("update-flow-settings", change(flowPatch, extra));
      expect(refused.status).toBe(403);
      expect(refused.body).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
      expect(refused.body.error).toContain(field);
      expect(call).not.toHaveBeenCalled();
      expect(await stored()).toEqual(before);
    } finally { await cleanup(); }
  });

  it("removes an auth session a token names before narrowing, as on every endpoint, so it never reaches the handler", async () => {
    const { send, change, call, stored, cleanup } = await route();
    try {
      const set = await send("update-flow-settings", change({ metadata: { humanness: 55 } }, { authSessionId: "someone-else" }));
      expect(set.status, set.body.error).toBe(200);
      expect(call.mock.calls[0]?.[0].payload).toEqual(change({ metadata: { humanness: 55 } }));
      expect((await stored()).metadata.humanness).toBe(55);
    } finally { await cleanup(); }
  });

  it("refuses a token's settings change with no body, and every other Flow write", async () => {
    const { flow, project, send, call, cleanup } = await route();
    try {
      expect((await send("update-flow-settings", undefined, "token", "GET")).status).toBe(403);
      for (const endpoint of ["save-flow", "apply-graph-patch", "get-flow", "create-flow"]) {
        expect((await send(endpoint, { projectId: project.id, flowId: flow.flowId, flow: { flowId: flow.flowId } })).status, endpoint).toBe(403);
      }
      expect(call).not.toHaveBeenCalled();
    } finally { await cleanup(); }
  });

  it("lets a signed-in person's cookie change other settings as before", async () => {
    const { send, change, stored, cleanup } = await route();
    try {
      const saved = await send("update-flow-settings", change({ name: "Renamed", description: "Described", metadata: { humanness: 30, flowSizeSettings: { maxNodesPerSubflow: 150 } } }), "cookie");
      expect(saved.status, saved.body.error).toBe(200);
      expect(await stored()).toMatchObject({ name: "Renamed", description: "Described", metadata: { humanness: 30, flowSizeSettings: { maxNodesPerSubflow: 150 } } });
    } finally { await cleanup(); }
  });
});
