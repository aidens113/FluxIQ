// @fluxiq-test-group real-sql
import { expect, it } from "vitest";
import { sqlAdmissionAuthority, sqlAdmissionFixture } from "./fixture.ts";
it.each(["materialized", "event", "mutation", "orphan_mutation", "missing"] as const)("fails closed on a real %s proof-join corruption", async (kind) => sqlAdmissionFixture(async ({ store, pool }) => {
    const actual = await sqlAdmissionAuthority(store);
    expect((await actual.assembly.consumer.inspect(actual.scope)).state).toBe("clear");
    const lease = await pool.acquire("project.isolated");
    try {
        if (kind === "materialized")
            await lease.database.run("update execution_admission_scopes set data_json='{}'");
        if (kind === "event")
            await lease.database.run("update execution_admission_events set proof_digest='sha256:corrupt'");
        if (kind === "mutation")
            await lease.database.run("update mutation_records set response_json='{}' where owner_kind='execution_admission'");
        if (kind === "missing")
            await lease.database.run("delete from execution_admission_scopes");
        if (kind === "orphan_mutation")
            await lease.database.run("insert into mutation_records(mutation_id,operation_kind,owner_kind,owner_id,request_digest,status,response_json,error_json,created_at_ms,updated_at_ms,completed_at_ms) select 'execution.orphan',operation_kind,owner_kind,owner_id,request_digest,status,response_json,error_json,created_at_ms,updated_at_ms,completed_at_ms from mutation_records where owner_kind='execution_admission' limit 1");
        expect((await actual.assembly.consumer.inspect(actual.scope)).state).toBe("unverified");
        await expect(actual.assembly.consumer.reserve(actual.scope, actual.grant)).rejects.toThrow();
        expect(await lease.database.get("select count(*) as count from gateway_command_claims")).toEqual({ count: 0 });
    }
    finally {
        await lease.release();
    }
}));
it("returns unverified on real bounded inventory overflow without silently truncating to clear", async () => sqlAdmissionFixture(async ({ store, pool }) => {
    const actual = await sqlAdmissionAuthority(store);
    const lease = await pool.acquire("project.isolated");
    try {
        const event = await lease.database.get<{
            event_id: string;
        }>("select event_id from execution_admission_events limit 1");
        await lease.database.transaction(async (sql) => {
            for (let ordinal = 0; ordinal <= 4096; ordinal++)
                await sql.run("insert into execution_admission_fences(resource_key,data_json,proof_event_id) values(?,'{}',?)", [`overflow.${ordinal}`, event!.event_id]);
        });
        expect(await actual.assembly.consumer.inspect(actual.scope)).toMatchObject({ state: "unverified", blockers: [{ code: "inventory_unverified" }] });
        await expect(actual.assembly.consumer.reserve(actual.scope, actual.grant)).rejects.toThrow("inventory_overflow");
    }
    finally {
        await lease.release();
    }
}));
it("refuses a parent frontier while an actual entered child remains open and rejects later child entry after closure", async () => sqlAdmissionFixture(async ({ store }) => {
    const actual = await sqlAdmissionAuthority(store);
    const reserved = await actual.assembly.consumer.reserve(actual.scope, actual.grant);
    const origin = actual.source.origin();
    const child = await actual.ports.producer.enter({ reservation: reserved.reservation, parent: reserved.root }, origin);
    await expect(store.finish({ entryId: actual.assembly.entryBridge.read(reserved.root).row.entryId, evidence: { kind: "coverage_complete", disposition: "settled", completionDigest: "forged.frontier-completion", assessmentDigest: "forged.frontier-assessment" } })).rejects.toThrow("children_unfinished");
    await actual.ports.producer.finish(child, actual.source.complete(origin));
    await actual.ports.producer.finish(reserved.root, actual.source.complete(actual.origin));
    await expect(actual.ports.producer.enter({ reservation: reserved.reservation, parent: reserved.root }, actual.source.origin())).rejects.toThrow();
    await actual.assembly.consumer.release(reserved.reservation);
    expect((await actual.assembly.consumer.inspect(actual.scope)).state).toBe("clear");
}));
