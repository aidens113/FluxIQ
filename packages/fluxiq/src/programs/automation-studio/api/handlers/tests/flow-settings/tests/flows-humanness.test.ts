// @fluxiq-test-group real-sql
// Covers handlers/flows.ts and flow-settings-requests: a Flow's own humanness, set, cleared and read through update-flow-settings,
// get-flow-metadata-detail and create-flow.
import { describe, expect, it, vi } from "vitest";

import { GlobalProgramApiRegistry, type ProgramApiActor } from "../../../../../../_shared/api.ts";
import { AUTOMATION_STUDIO_ENDPOINTS } from "../../../../../../../api-contracts/automation.ts";
import { cacheActor } from "../../test-actor.ts";
import { createCacheApiTestService } from "../../test-service.ts";
import { registerAutomationStudioApi } from "../../../index.ts";

const writer: ProgramApiActor = { ...cacheActor("user.humanness"), permissions: ["programs.read", "programs.write", "flows.write"] };

async function humannessApi() {
  const { service, cleanup } = await createCacheApiTestService();
  const project = await service.createProject({ name: "Flow humanness API" });
  const flow = await service.createFlow({ projectId: project.id, name: "Humanness Flow" });
  const registry = new GlobalProgramApiRegistry({ identityAccess: { authorizeSessionPin: vi.fn() } as any });
  registerAutomationStudioApi(registry, service);
  const call = (endpoint: string, payload: Record<string, unknown>) => registry.call({ programId: "automation-studio", endpoint, scope: {}, actor: writer, payload: { projectId: project.id, ...payload } });
  const update = (metadata: Record<string, unknown>) => call(AUTOMATION_STUDIO_ENDPOINTS.updateFlowSettings, { flowId: flow.flowId, flow: { flowId: flow.flowId, metadata } });
  const detail = () => call(AUTOMATION_STUDIO_ENDPOINTS.getFlowMetadataDetail, { flowId: flow.flowId });
  const stored = async () => (await service.getFlow(project.id, flow.flowId)).metadata ?? {};
  const create = (extra: Record<string, unknown>) => call(AUTOMATION_STUDIO_ENDPOINTS.createFlow, extra);
  return { service, project, flow, cleanup, update, detail, stored, create };
}

describe("Flow humanness in the Flow's settings", () => {
  it("has none on a new Flow, in the document and on read", async () => {
    const { cleanup, detail, stored } = await humannessApi();
    try {
      expect("humanness" in await stored()).toBe(false);
      const read: any = await detail();
      expect(read.ok, read.error).toBe(true);
      expect(read.payload.flow.metadata?.humanness).toBeUndefined();
    } finally { await cleanup(); }
  });

  it.each([0, 50, 100])("sets %s, returns it from the save and on read", async (value) => {
    const { cleanup, update, detail, stored } = await humannessApi();
    try {
      const saved: any = await update({ humanness: value });
      expect(saved.ok, saved.error).toBe(true);
      expect(saved.payload.flow.metadata.humanness).toBe(value);
      expect((await stored()).humanness).toBe(value);
      expect(((await detail()) as any).payload.flow.metadata.humanness).toBe(value);
    } finally { await cleanup(); }
  });

  it("clears it with null, removing the key", async () => {
    const { cleanup, update, detail, stored } = await humannessApi();
    try {
      await update({ humanness: 60 });
      const cleared: any = await update({ humanness: null });
      expect(cleared.ok, cleared.error).toBe(true);
      expect("humanness" in await stored()).toBe(false);
      expect(((await detail()) as any).payload.flow.metadata?.humanness).toBeUndefined();
    } finally { await cleanup(); }
  });

  it.each([101, -1, 2.5, "50"])("refuses %j, naming humanness, and keeps the stored level", async (value) => {
    const { cleanup, update, stored } = await humannessApi();
    try {
      await update({ humanness: 40 });
      const refused: any = await update({ humanness: value });
      expect(refused.ok).toBe(false);
      expect(refused.error).toContain("humanness");
      expect((await stored()).humanness).toBe(40);
    } finally { await cleanup(); }
  });

  it("leaves other settings alone when humanness changes, and the reverse", async () => {
    const { cleanup, update, stored } = await humannessApi();
    try {
      await update({ flowSizeSettings: { maxNodesPerSubflow: 150 } });
      await update({ humanness: 70 });
      expect(await stored()).toMatchObject({ humanness: 70, flowSizeSettings: { maxNodesPerSubflow: 150 } });
      await update({ flowSizeSettings: { maxNodesPerSubflow: 200 } });
      expect(await stored()).toMatchObject({ humanness: 70, flowSizeSettings: { maxNodesPerSubflow: 200 } });
      await update({ humanness: null });
      expect(await stored()).toMatchObject({ flowSizeSettings: { maxNodesPerSubflow: 200 } });
    } finally { await cleanup(); }
  });
});

describe("create-flow with a starting humanness", () => {
  it("stores it as the new Flow's own", async () => {
    const { cleanup, project, create, service } = await humannessApi();
    try {
      const made: any = await create({ name: "Careful", humanness: 35 });
      expect(made.ok, made.error).toBe(true);
      expect(made.payload.flow.metadata.humanness).toBe(35);
      expect((await service.getFlow(project.id, made.payload.flow.flowId)).metadata?.humanness).toBe(35);
    } finally { await cleanup(); }
  });

  it("creates the Flow exactly as before when it is absent", async () => {
    const { cleanup, project, create, service } = await humannessApi();
    try {
      const plain: any = await create({ name: "Plain", flowId: "flow.plain" });
      expect(plain.ok, plain.error).toBe(true);
      expect("humanness" in (plain.payload.flow.metadata ?? {})).toBe(false);
      const direct = await service.createFlow({ projectId: project.id, name: "Plain", flowId: "flow.direct" });
      const strip = (flow: any) => {
        const { flowId, createdAt, updatedAt, revision, ...rest } = flow;
        return JSON.parse(JSON.stringify(rest).replaceAll(flowId, "<id>"));
      };
      expect(strip(plain.payload.flow)).toEqual(strip(direct));
    } finally { await cleanup(); }
  });

  it("stores 40 with exactly a plain create's writes: the same revision, never a second save", async () => {
    const { cleanup, project, create, service } = await humannessApi();
    try {
      const plain: any = await create({ name: "Plain", flowId: "flow.plain.writes" });
      const human: any = await create({ name: "Plain", flowId: "flow.human.writes", humanness: 40 });
      expect(plain.ok, plain.error).toBe(true);
      expect(human.ok, human.error).toBe(true);
      expect(human.payload.flow.metadata.humanness).toBe(40);
      const stored = await service.getFlow(project.id, "flow.human.writes");
      expect(stored.metadata?.humanness).toBe(40);
      // One write each: a second settings save would have moved the revision on.
      expect(stored.revision).toBe((await service.getFlow(project.id, "flow.plain.writes")).revision);
      const strip = (flow: any) => {
        const { flowId, createdAt, updatedAt, revision, ...rest } = flow;
        const { humanness: _level, ...metadata } = rest.metadata ?? {};
        return JSON.parse(JSON.stringify({ ...rest, metadata }).replaceAll(flowId, "<id>"));
      };
      expect(strip(stored)).toEqual(strip(await service.getFlow(project.id, "flow.plain.writes")));
    } finally { await cleanup(); }
  });

  it.each([101, -1, 2.5, "50", null])("refuses %j and creates nothing", async (value) => {
    const { cleanup, create, service, project } = await humannessApi();
    try {
      const before = (await service.listFlows(project.id)).length;
      const refused: any = await create({ name: "Bad", humanness: value });
      expect(refused.ok).toBe(false);
      expect(refused.error).toContain("humanness");
      expect((await service.listFlows(project.id)).length).toBe(before);
    } finally { await cleanup(); }
  });
});
