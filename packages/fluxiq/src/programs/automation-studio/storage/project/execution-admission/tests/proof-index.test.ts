// @fluxiq-test-group real-sql
import { expect, it, vi } from "vitest";
import { AutomationStudioStatementCache } from "../../../../../../framework/persistence/project/sql/index.ts";
import type { ReservedExecution } from "../../../../../../runtime/execution-admission/index.ts";
import { AutomationStudioProjectExecutionAdmissionStore } from "../../../../../../framework/persistence/project/execution-admission/index.ts";
import { sqlAdmissionAuthority, sqlAdmissionFixture } from "./fixture.ts";

type Authority = Awaited<ReturnType<typeof sqlAdmissionAuthority>>;

async function appendChildren(actual: Authority, reserved: ReservedExecution, count: number): Promise<void> {
    for (let ordinal = 0; ordinal < count; ordinal++) {
        const origin = actual.source.origin();
        const child = await actual.ports.producer.enter({ reservation: reserved.reservation, parent: reserved.root }, origin);
        await actual.ports.producer.finish(child, actual.source.complete(origin));
    }
}

it("keeps native proof-get work fixed as actual completed-child history grows", async () => sqlAdmissionFixture(async ({ store }) => {
    const actual = await sqlAdmissionAuthority(store);
    const reserved = await actual.assembly.consumer.reserve(actual.scope, actual.grant);
    const gets = vi.spyOn(AutomationStudioStatementCache.prototype, "get");
    const counts: number[] = [];
    try {
        for (const additional of [8, 16]) {
            await appendChildren(actual, reserved, additional);
            gets.mockClear();
            expect((await actual.assembly.consumer.inspect(actual.scope)).state).toBe("pending");
            counts.push(gets.mock.calls.length);
        }
        expect(counts, "Native gets at 8 and 24 completed children").toEqual([0, 0]);
    }
    finally {
        gets.mockRestore();
    }
}));

const corruptions = {
    missing: "delete from mutation_records where mutation_id=?",
    owner: "update mutation_records set owner_id='foreign.owner' where mutation_id=?",
    owner_kind: "update mutation_records set owner_kind='gateway_command' where mutation_id=?",
    operation: "update mutation_records set operation_kind='gateway_command.claim' where mutation_id=?",
    request: "update mutation_records set request_digest='sha256:0000000000000000000000000000000000000000000000000000000000000000' where mutation_id=?",
    status: "update mutation_records set status='failed' where mutation_id=?",
    response: "update mutation_records set response_json='{}' where mutation_id=?"
} as const;

it.each(Object.keys(corruptions) as (keyof typeof corruptions)[])("rechecks an old %s mutation proof after a successful inventory read", async (kind) => sqlAdmissionFixture(async ({ store, pool }) => {
    const actual = await sqlAdmissionAuthority(store);
    const reserved = await actual.assembly.consumer.reserve(actual.scope, actual.grant);
    await appendChildren(actual, reserved, 4);
    const contender = await sqlAdmissionAuthority(store, { continuation: "flow.contender", resources: ["fixture.contender-resource"] });
    expect((await actual.assembly.consumer.inspect(actual.scope)).state).toBe("pending");
    const lease = await pool.acquire("project.isolated");
    const gets = vi.spyOn(AutomationStudioStatementCache.prototype, "get");
    try {
        const oldest = await lease.database.get<{ mutation_id: string }>("select mutation_id from execution_admission_events order by sequence limit 1");
        if (!oldest) throw new Error("Isolated historical event missing.");
        await lease.database.run(corruptions[kind], [oldest.mutation_id]);
        gets.mockClear();
        expect((await actual.assembly.consumer.inspect(actual.scope)).state).toBe("unverified");
        if (kind === "missing") expect(gets.mock.calls, "A missing indexed proof never falls back to a native lookup").toHaveLength(0);
        await expect(contender.assembly.consumer.reserve(contender.scope, contender.grant)).rejects.toThrow();
        expect(await lease.database.get("select count(*) as count from gateway_command_claims")).toEqual({ count: 0 });
    }
    finally {
        gets.mockRestore();
        await lease.release();
    }
}));

it("rebuilds proof indexes independently for separate project databases", async () => sqlAdmissionFixture(async ({ store, pool }) => {
    const first = await sqlAdmissionAuthority(store);
    const otherStore = await AutomationStudioProjectExecutionAdmissionStore.open({ pool, projectId: "project.other" });
    const lease = await pool.acquire("project.isolated");
    try {
        const other = await sqlAdmissionAuthority(otherStore, { projectId: "project.other" });
        expect((await first.assembly.consumer.inspect(first.scope)).state).toBe("clear");
        expect((await other.assembly.consumer.inspect(other.scope)).state).toBe("clear");
        await expect(other.assembly.consumer.reserve(other.scope, first.grant)).rejects.toThrow("grant_spent_or_foreign");
        await lease.database.run("update mutation_records set response_json='{}' where mutation_id=(select mutation_id from execution_admission_events order by sequence limit 1)");
        expect((await first.assembly.consumer.inspect(first.scope)).state).toBe("unverified");
        expect((await other.assembly.consumer.inspect(other.scope)).state).toBe("clear");
        await expect(first.assembly.consumer.reserve(first.scope, first.grant)).rejects.toThrow();
        const reserved = await other.assembly.consumer.reserve(other.scope, other.grant);
        await other.ports.producer.finish(reserved.root, other.source.complete(other.origin));
        await other.assembly.consumer.release(reserved.reservation);
        expect((await other.assembly.consumer.inspect(other.scope)).state).toBe("clear");
    }
    finally {
        await lease.release();
        await otherStore.close();
    }
}));
