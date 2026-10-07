import { expect, it, vi } from "vitest";
import { wholeFixture } from "./whole-fixture.ts";
import { CanonicalAuthorityWholeOperation } from "../whole-operation.ts";
import { AutomationStudioProjectAuthorityGuardStore } from "../../project/authority-guard/index.ts";

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
    await wholeFixture(mode, async f => {
      const flow = await f.creation.createFlow({ projectId: f.project.id, name: "Original" });
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
  await wholeFixture("sql", async f => {
    const flow = await f.creation.createFlow({ projectId: f.project.id, name: "Original" });
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
