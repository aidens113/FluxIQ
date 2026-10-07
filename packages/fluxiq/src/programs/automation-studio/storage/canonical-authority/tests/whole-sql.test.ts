import { expect, it, vi } from "vitest";
import { wholeFixture } from "./whole-fixture.ts";
import { CanonicalAuthorityWholeSql } from "../whole-sql.ts";
import type { CanonicalWholeSqlCapability } from "../contracts.ts";

it("binds actual SQL privilege to immutable input, exact opaque identity, and one consumption", async () => {
  await wholeFixture("sql", async f => {
    let consumed!: CanonicalWholeSqlCapability, boundInput: unknown;
    const issue = f.authority.sqlCapability.bind(f.authority), observations: Array<Promise<void>> = [];
    vi.spyOn(f.authority, "sqlCapability").mockImplementation((kind, entityId, input) => {
      const capability = issue(kind, entityId, input);
      if (kind === "sql_flow_metadata") {
        consumed = capability; boundInput = input;
        // Owning method will await its SQL transaction after this issuance.
        observations.push((async () => {
          const lease = await f.pool.acquire(f.project.id);
          try {
            await expect(CanonicalAuthorityWholeSql.validate({ ...capability } as CanonicalWholeSqlCapability, lease.database, lease.database, kind, entityId, input)).rejects.toThrow("sql_capability");
            await expect(CanonicalAuthorityWholeSql.validate(capability, lease.database, lease.database, kind, entityId, { ...(input as object), name: "changed" })).rejects.toThrow("sql_capability");
          } finally { await lease.release(); }
        })());
      }
      return capability;
    });
    const flow = await f.creation.createFlow({ projectId: f.project.id, name: "Original" }); await Promise.all(observations);
    const lease = await f.pool.acquire(f.project.id);
    try { await expect(CanonicalAuthorityWholeSql.validate(consumed, lease.database, lease.database, "sql_flow_metadata", flow.flowId, boundInput)).rejects.toThrow("sql_capability"); }
    finally { await lease.release(); }
  });
});

it("never issues privilege from a copied or caller-shaped whole admission", () => {
  expect(() => CanonicalAuthorityWholeSql.fromAdmission({} as never)).toThrow("capability");
});

for (const effect of ["metadata", "feed"] as const) for (const corruption of ["owner", "operation", "predecessor", "mutation", "request-size", "claim-size"] as const) it(`refuses ${corruption} parent corruption before actual ${effect} effect`, async () => {
  await wholeFixture("sql", async f => {
    const flow = await f.creation.createFlow({ projectId: f.project.id, name: "Original" }); let effectError: unknown;
    try {
      await f.authority.saveFlow(f.project.id, flow.flowId, {}, async () => {
        const lease = await f.pool.acquire(f.project.id);
        try {
          await lease.database.transaction(async sql => {
            const row = await sql.get<{ operation_key: string; request_json: string; claim_json: string }>("select operation_key,request_json,claim_json from authority_guard_legacy where completion_json is null");
            if (corruption === "mutation") await sql.run("delete from mutation_records where mutation_id=?", [`authority_guard:${row!.operation_key}:legacy.claim`]);
            else if (corruption === "predecessor") await sql.run("update authority_guard_legacy set predecessor_key='wrong-predecessor' where operation_key=?", [row!.operation_key]);
            else {
              const field = corruption === "claim-size" ? "claim_json" : "request_json", document = JSON.parse(row![field]);
              if (corruption === "owner") document.ownerId = "wrong-owner";
              else if (corruption === "operation") document.operationKind = "wrong-operation";
              else document.padding = "x".repeat(8192);
              await sql.run(`update authority_guard_legacy set ${field}=? where operation_key=?`, [JSON.stringify(document), row!.operation_key]);
            }
          });
        } finally { await lease.release(); }
        try {
          if (effect === "metadata") await f.flows.writeSqlFlowMetadata(f.project.id, { ...flow, name: "Forbidden physical row" });
          else await f.writer.appendProjectMutationChangeFeed({ projectId: f.project.id, entityKind: "flow", entityId: flow.flowId, operation: "update", revision: 2, changedAt: Date.now() });
        } catch (error) { effectError = error; }
        throw new Error("isolated probe ends held");
      });
    } catch { /* Corrupted actual claims remain held; cleanup failure may aggregate. */ }
    const lease = await f.pool.acquire(f.project.id);
    try {
      expect(await lease.database.get("select name from flows where flow_id=?", [flow.flowId])).toMatchObject({ name: "Original" });
      expect(await lease.database.get("select count(*) as count from change_feed where entity_id=?", [flow.flowId])).toMatchObject({ count: 1 });
      expect(await lease.database.get("select count(*) as count from canonical_whole_effect_receipts")).toMatchObject({ count: 2 });
    } finally { await lease.release(); }
    expect(effectError, "actual owning SQL call must refuse before physical effect").toBeDefined();
  });
});
