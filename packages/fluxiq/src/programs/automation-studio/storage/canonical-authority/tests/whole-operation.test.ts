import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { disposeWholeFlowTemplate, wholeFlowFromTemplate, wholeFlowTemplate, wholeProjectFromTemplate, wholeProjectTemplate, type WholeFlowTemplate, type WholeProjectTemplate } from "./whole-fixture.ts";
import { CanonicalAuthorityWholeOperation } from "../whole-operation.ts";
import { AutomationStudioProjectAuthorityGuardStore } from "../../project/authority-guard/index.ts";

// Each case's subject is the Flow operation after the project exists, so the
// project is created once per mode and copied into every case (t731): created
// afresh in each case, it ran these cases past the 15 s limit in a loaded
// package run. One hook per mode, so each hook carries one project creation.
// The cases whose subject is a save after the Flow exists copy a Flow created
// once per mode in a copy of that project, again one hook per template.
const projects = new Map<"sql" | "file", WholeProjectTemplate>();
const flows = new Map<"sql" | "file", WholeFlowTemplate>();
for (const mode of ["sql", "file"] as const) beforeAll(async () => { projects.set(mode, await wholeProjectTemplate(mode)); });
for (const mode of ["sql", "file"] as const) beforeAll(async () => { flows.set(mode, await wholeFlowTemplate(mode, projects.get(mode))); });
afterAll(async () => {
  for (const template of [...flows.values(), ...projects.values()]) await disposeWholeFlowTemplate(template);
  flows.clear();
  projects.clear();
});
const wholeFixture = (mode: "sql" | "file", run: Parameters<typeof wholeProjectFromTemplate>[1]) => wholeProjectFromTemplate(projects.get(mode)!, run);

for (const mode of ["sql", "file"] as const) {
  it(`holds actual ${mode} partial writer effects across a fresh authority reopen`, async () => {
    await wholeFixture(mode, async f => {
      vi.spyOn(f.flows, "writeProjectFlow").mockRejectedValueOnce(new Error("injected after canonical effect"));
      await expect(f.creation.createFlow({ projectId: f.project.id, name: "Partial" })).rejects.toThrow("injected after canonical effect");
      const row = await f.database.transaction({}, sql => sql.get<{ resource_id: string }>("select resource_id from canonical_authority_owners where original_project_id=?", [f.project.id]));
      expect(row).toBeDefined(); expect((await f.repositories.flows.get(row!.resource_id))?.name).toBe("Partial");
      const reopened = await CanonicalAuthorityWholeOperation.fromFactory(f.repositories, f.options), body = vi.fn(async () => "wrong");
      await expect(reopened.saveFlow(f.project.id, row!.resource_id, {}, body)).rejects.toThrow("unresolved"); expect(body).not.toHaveBeenCalled();
      expect(await f.database.transaction({}, sql => sql.get("select status,pending_operation_key from canonical_authority_lifecycle where original_project_id=?", [f.project.id]))).toMatchObject({ status: "active", pending_operation_key: expect.any(String) });
    });
  });
  it(`has one ${mode} writer admission while the actual first effect is pending`, async () => {
    await wholeFlowFromTemplate(flows.get(mode)!, async f => {
      const flow = f.flow;
      let entered!: () => void, resume!: () => void; const ready = new Promise<void>(resolve => { entered = resolve; }), held = new Promise<void>(resolve => { resume = resolve; });
      const original = f.flows.writeProjectFlow.bind(f.flows);
      vi.spyOn(f.flows, "writeProjectFlow").mockImplementationOnce(async (...args) => { await original(...args); entered(); await held; });
      const winner = f.writer.saveFlowInternal({ projectId: f.project.id, flow: { ...flow, name: "Winner" } }, false); await ready;
      try { await expect(f.writer.saveFlowInternal({ projectId: f.project.id, flow: { ...flow, name: "Loser" } }, false)).rejects.toThrow("unresolved"); }
      finally { resume(); }
      await winner; expect((await f.repositories.flows.get(flow.flowId))?.name).toBe("Winner");
    });
  });
}
it("refuses unsupported graph input before admission or any canonical effect", async () => {
  await wholeFlowFromTemplate(flows.get("sql")!, async f => {
    const flow = f.flow;
    const before = await f.database.transaction({}, sql => sql.get("select count(*) as count from canonical_authority_operations"));
    await expect(f.writer.saveFlowInternal({ projectId: f.project.id, flow: { ...flow, nodes: [{ nodeId: "unsupported" }] } as never }, false)).rejects.toThrow("unsupported");
    expect(await f.database.transaction({}, sql => sql.get("select count(*) as count from canonical_authority_operations"))).toEqual(before);
    expect((await f.repositories.flows.get(flow.flowId))?.name).toBe("Original");
  });
});
it("rereads the actual global receipt after project completion and retains a corrupted partial join", async () => {
  await wholeFixture("sql", async f => {
    const complete = AutomationStudioProjectAuthorityGuardStore.prototype.completeLegacy;
    const spy = vi.spyOn(AutomationStudioProjectAuthorityGuardStore.prototype, "completeLegacy").mockImplementationOnce(async function (this: AutomationStudioProjectAuthorityGuardStore, ...args) {
      const answer = await complete.apply(this, args);
      await f.database.transaction({}, async sql => {
        const row = await sql.get<{ operation_key: string; effect_json: string }>("select operation_key,effect_json from canonical_authority_operations where phase='effect_applied' and original_project_id=?", [f.project.id]);
        const corrupted = JSON.parse(row!.effect_json); corrupted.resultDigest = `sha256:${"0".repeat(64)}`;
        await sql.run("update canonical_authority_operations set effect_json=? where operation_key=?", [JSON.stringify(corrupted), row!.operation_key]);
      }); return answer;
    });
    try { await expect(f.creation.createFlow({ projectId: f.project.id, name: "Corrupted join" })).rejects.toThrow("global_receipt"); }
    finally { spy.mockRestore(); }
    expect(await f.database.transaction({}, sql => sql.get("select phase from canonical_authority_operations where original_project_id=? and phase='unknown'", [f.project.id]))).toMatchObject({ phase: "unknown" });
    await expect(f.creation.createFlow({ projectId: f.project.id, name: "No release" })).rejects.toThrow("unresolved");
  });
});
