// Covers handlers/project-parts.ts.

import { describe, expect, it, vi } from "vitest";

import { GlobalProgramApiRegistry } from "../../../../../../_shared/api.ts";
import { AUTOMATION_STUDIO_ENDPOINTS } from "../../../../../../../api-contracts/automation.ts";
import { AutomationStudioService } from "../../../../../../../framework/automation-service/index.ts";
import { cacheActor } from "../../test-actor.ts";
import { registerAutomationStudioApi } from "../../../index.ts";

function setup(projectParts: Record<string, unknown>) {
  const registry = new GlobalProgramApiRegistry();
  registerAutomationStudioApi(registry, { projectParts, assertProjectDomainAccess: vi.fn().mockResolvedValue(undefined) } as any);
  const call = (endpoint: string, payload: unknown, permissions = ["programs.read"]) => registry.call({ programId: "automation-studio", endpoint, scope: {}, actor: { ...cacheActor("user.parts"), permissions }, payload } as any);
  return { registry, call };
}

describe("project parts endpoints", () => {
  it("registers search and read under programs.read and a save under flows.write, each scoped to the project", () => {
    const { registry } = setup({});
    const entries = registry.endpoints().filter((entry) => entry.programId === "automation-studio");
    const named = (endpoint: string) => entries.find((entry) => entry.endpoint === endpoint);
    expect(named(AUTOMATION_STUDIO_ENDPOINTS.listProjectParts)).toMatchObject({ permission: "programs.read", classification: "read" });
    expect(named(AUTOMATION_STUDIO_ENDPOINTS.getProjectPart)).toMatchObject({ permission: "programs.read", classification: "read" });
    expect(named(AUTOMATION_STUDIO_ENDPOINTS.saveProjectPart)).toMatchObject({ permission: "flows.write", classification: "authoring" });
  });

  it("forwards only the fields it names to the library, and answers the library's page as the payload", async () => {
    const list = vi.fn().mockResolvedValue({ parts: [], nextCursor: null, hasMore: false });
    const { call } = setup({ list });
    const response = await call(AUTOMATION_STUDIO_ENDPOINTS.listProjectParts, { projectId: "project.one", query: "shoes", site: "shop.example", inputName: ["a", 3], lasting: "move_money", trust: "provisional", limit: 5, cursor: "c", pool: "x", flowId: "flow.nope", __proto__: { evil: true } });
    expect(list).toHaveBeenCalledWith({ projectId: "project.one", query: "shoes", site: "shop.example", inputName: ["a"], lasting: "move_money", trust: "provisional", limit: 5, cursor: "c" });
    expect(response).toMatchObject({ ok: true, payload: { parts: [], hasMore: false } });
  });

  it("forwards a read of one part by id and version only", async () => {
    const get = vi.fn().mockResolvedValue({ card: {}, steps: [], calls: [], versions: [], callers: [] });
    const { call } = setup({ get });
    await call(AUTOMATION_STUDIO_ENDPOINTS.getProjectPart, { projectId: "project.one", partId: "part.a", version: 2, snapshot: true });
    expect(get).toHaveBeenCalledWith({ projectId: "project.one", partId: "part.a", version: 2 });
  });

  it("forwards a save as exactly its five fields, and refuses a caller without flows.write", async () => {
    const save = vi.fn().mockResolvedValue({ saved: true, partId: "part.a", version: 1, status: "created" });
    const { call } = setup({ save });
    const forbidden = await call(AUTOMATION_STUDIO_ENDPOINTS.saveProjectPart, { projectId: "project.one", flowId: "f", subflowId: "s" });
    expect(forbidden).toMatchObject({ ok: false });
    expect(save).not.toHaveBeenCalled();
    const response = await call(AUTOMATION_STUDIO_ENDPOINTS.saveProjectPart, { projectId: "project.one", flowId: "f", subflowId: "s", name: "N", purpose: "P", explicit: false, role: "primary" }, ["programs.read", "programs.write", "flows.write"]);
    expect(save).toHaveBeenCalledWith({ projectId: "project.one", flowId: "f", subflowId: "s", name: "N", purpose: "P" });
    expect(response).toMatchObject({ ok: true, payload: { saved: true, partId: "part.a" } });
  });

  it("registers a run under runtime.control, forwards exactly its seven fields, and refuses a caller without it", async () => {
    const answer = { runId: "r", status: "succeeded", outputs: {}, acts: [], modelCalls: 0 };
    const run = vi.fn().mockResolvedValue(answer);
    const { registry, call } = setup({ run });
    expect(registry.endpoints().find((entry) => entry.endpoint === AUTOMATION_STUDIO_ENDPOINTS.runProjectPart)).toMatchObject({ permission: "runtime.control", classification: "authoring" });
    expect(await call(AUTOMATION_STUDIO_ENDPOINTS.runProjectPart, { projectId: "p", partId: "part.a" })).toMatchObject({ ok: false });
    expect(run).not.toHaveBeenCalled();
    const response = await call(AUTOMATION_STUDIO_ENDPOINTS.runProjectPart, { projectId: "p", partId: "part.a", version: 2, inputs: { query: "shoes" }, permittedConsequences: ["create_new", 3], acknowledgedRepeat: true, newRunId: "id", caller: "build", permission: "x", flowId: "f" }, ["runtime.control"]);
    expect(run).toHaveBeenCalledWith({ projectId: "p", partId: "part.a", version: 2, inputs: { query: "shoes" }, permittedConsequences: ["create_new"], acknowledgedRepeat: true, newRunId: "id" });
    expect(response).toEqual({ ok: true, payload: answer });
  });

  it("answers a run's refusal as its closed code, its words and its classes, as a payload", async () => {
    const refusal = { ok: false, code: "part.confirm_repeat", message: "Running this part will change something that already exists again.", classes: ["modify_existing"] };
    const { call } = setup({ run: vi.fn().mockResolvedValue(refusal) });
    expect(await call(AUTOMATION_STUDIO_ENDPOINTS.runProjectPart, { projectId: "p", partId: "part.a", acknowledgedRepeat: "yes" }, ["runtime.control"])).toEqual({ ok: true, payload: { refused: true, code: refusal.code, message: refusal.message, classes: refusal.classes } });
  });

  it("answers a library that is not there as a closed code in the payload, not an error", async () => {
    const refusal = { ok: false, code: "parts.unavailable", message: "This project's library of saved parts is not available right now." };
    const { call } = setup({ list: vi.fn().mockResolvedValue(refusal), get: vi.fn().mockResolvedValue({ ...refusal, code: "parts.not_found" }) });
    expect(await call(AUTOMATION_STUDIO_ENDPOINTS.listProjectParts, { projectId: "p" })).toEqual({ ok: true, payload: { refused: true, code: "parts.unavailable", message: refusal.message } });
    expect(await call(AUTOMATION_STUDIO_ENDPOINTS.getProjectPart, { projectId: "p", partId: "x" })).toMatchObject({ ok: true, payload: { refused: true, code: "parts.not_found" } });
  });

  describe("a caller from another domain, on a real project", () => {
    const REFUSED = "Automation Studio project is unavailable in this domain scope.";
    const PERMISSIONS = ["programs.read", "flows.write", "runtime.control"];
    const ROUTES = [
      [AUTOMATION_STUDIO_ENDPOINTS.listProjectParts, "list", {}],
      [AUTOMATION_STUDIO_ENDPOINTS.getProjectPart, "get", { partId: "part.a" }],
      [AUTOMATION_STUDIO_ENDPOINTS.saveProjectPart, "save", { flowId: "flow.a", subflowId: "subflow.a" }],
      [AUTOMATION_STUDIO_ENDPOINTS.runProjectPart, "run", { partId: "part.a" }]
    ] as const;

    /** The real domain check over a real project in `web-automation`; only the library is a stand-in, so what it was asked is seen. */
    async function aProject() {
      const service = new AutomationStudioService({ seedFixture: false });
      const { id: projectId } = await service.createProject({ name: "Parts", domainId: "web-automation" });
      const library = { list: vi.fn().mockResolvedValue({ parts: [] }), get: vi.fn().mockResolvedValue({ steps: [] }), save: vi.fn().mockResolvedValue({ saved: true }), run: vi.fn().mockResolvedValue({ runId: "r" }) };
      const registry = new GlobalProgramApiRegistry();
      registerAutomationStudioApi(registry, new Proxy(service, { get: (target, property) => (property === "projectParts" ? library : Reflect.get(target, property, target)) }));
      const call = (endpoint: string, domainId: string | null | undefined, payload: unknown) => registry.call({ programId: "automation-studio", endpoint, scope: domainId === undefined ? {} : { domainId }, actor: { ...cacheActor("user.parts"), permissions: PERMISSIONS }, payload } as any);
      return { projectId, library, call };
    }

    it.each(ROUTES)("%s is refused before the library hears of it, and answers the project's own domain", async (endpoint, method, fields) => {
      const { projectId, library, call } = await aProject();
      for (const domainId of ["another-domain", null, undefined]) {
        expect(await call(endpoint, domainId, { projectId, ...fields })).toMatchObject({ ok: false, error: REFUSED });
      }
      expect(library[method]).not.toHaveBeenCalled();
      expect(await call(endpoint, "web-automation", { projectId, ...fields })).toMatchObject({ ok: true });
      expect(library[method]).toHaveBeenCalledTimes(1);
    });

    it("goes on with exactly the id it asserted, and refuses one it cannot read", async () => {
      const { projectId, library, call } = await aProject();
      await call(AUTOMATION_STUDIO_ENDPOINTS.runProjectPart, "web-automation", { projectId: ` ${projectId} `, partId: "part.a" });
      expect(library.run).toHaveBeenCalledWith(expect.objectContaining({ projectId }));
      library.run.mockClear();
      expect(await call(AUTOMATION_STUDIO_ENDPOINTS.runProjectPart, "web-automation", { projectId: 7, partId: "part.a" })).toMatchObject({ ok: false });
      expect(library.run).not.toHaveBeenCalled();
    });
  });
});
