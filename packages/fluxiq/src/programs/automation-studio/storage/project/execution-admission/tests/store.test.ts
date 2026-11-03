// @fluxiq-test-group real-sql
import { expect, it } from "vitest";
import { AutomationStudioProjectDatabasePool } from "../../../../../../framework/persistence/project/sql/index.ts";
import { AutomationStudioProjectExecutionAdmissionStore } from "../index.ts";
import { sqlAdmissionAuthority, sqlAdmissionFixture } from "./fixture.ts";
it("persists actual entered children and complete frontier before clear, without closing on release", async () => sqlAdmissionFixture(async ({ store }) => {
    const actual = await sqlAdmissionAuthority(store);
    expect((await actual.assembly.consumer.inspect(actual.scope)).state).toBe("clear");
    const reserved = await actual.assembly.consumer.reserve(actual.scope, actual.grant);
    expect((await actual.assembly.consumer.inspect(actual.scope)).state).toBe("pending");
    const origin = actual.source.origin();
    const child = await actual.ports.producer.enter({ reservation: reserved.reservation, parent: reserved.root }, origin);
    await actual.ports.producer.finish(child, actual.source.complete(origin));
    await actual.ports.producer.finish(reserved.root, actual.source.complete(actual.origin));
    await actual.assembly.consumer.release(reserved.reservation);
    expect((await actual.assembly.consumer.inspect(actual.scope)).state).toBe("clear");
}));
it("retains a real counter increment followed by throw across new runs, epochs and reopened owners", async () => sqlAdmissionFixture(async ({ store, root }) => {
    const actual = await sqlAdmissionAuthority(store, { series: true, runId: "run.first" });
    const reserved = await actual.assembly.consumer.reserve(actual.scope, actual.grant);
    const origin = actual.source.origin("actual.counter", "run.first");
    const child = await actual.ports.producer.enter({ reservation: reserved.reservation, parent: reserved.root }, origin);
    let externalCounter = 0;
    const callback = () => {
        externalCounter++;
        throw new Error("isolated actual act then throw");
    };
    expect(callback).toThrow("actual act then throw");
    await actual.ports.producer.interrupted(child, "callback_threw");
    await actual.assembly.consumer.release(reserved.reservation);
    const pool = new AutomationStudioProjectDatabasePool({ rootDir: root });
    const reopened = await AutomationStudioProjectExecutionAdmissionStore.open({ pool, projectId: "project.isolated" });
    try {
        const next = await sqlAdmissionAuthority(reopened, { series: true, epoch: "epoch.new", runId: "run.new" });
        expect((await next.assembly.consumer.inspect(next.scope)).state).toBe("pending");
        await expect(next.assembly.consumer.reserve(next.scope, next.grant)).rejects.toThrow("execution_blocked");
        expect(externalCounter).toBe(1);
    }
    finally {
        await reopened.close();
        await pool.closeAll();
    }
}));
it("preserves the first unverified live trial but refuses another after an actual entered callback", async () => sqlAdmissionFixture(async ({ store }) => {
    const first = await sqlAdmissionAuthority(store, { baseline: "unverified", series: true });
    const reserved = await first.assembly.consumer.reserve(first.scope, first.grant);
    const origin = first.source.origin();
    const child = await first.ports.producer.enter({ reservation: reserved.reservation, parent: reserved.root }, origin);
    await first.ports.producer.observe(child, first.source.prove(origin, { kind: "returned_unverified", completionDigest: "actual.returned" }));
    await first.ports.producer.observe(reserved.root, first.source.prove(first.origin, { kind: "returned_unverified", completionDigest: "actual.root-returned" }));
    await first.assembly.consumer.release(reserved.reservation);
    const next = await sqlAdmissionAuthority(store, { baseline: "complete", series: true, runId: "run.new" });
    expect((await next.assembly.consumer.inspect(next.scope)).state).toBe("unverified");
    await expect(next.assembly.consumer.reserve(next.scope, next.grant)).rejects.toThrow("retest_unverified");
}));
it("fences competing roots on the same resource while a disjoint actual resource can enter", async () => sqlAdmissionFixture(async ({ store, root }) => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir: root });
    const other = await AutomationStudioProjectExecutionAdmissionStore.open({ pool, projectId: "project.isolated" });
    try {
        const first = await sqlAdmissionAuthority(store, { continuation: "flow.one" });
        const second = await sqlAdmissionAuthority(other, { continuation: "flow.two" });
        const race = await Promise.allSettled([first.assembly.consumer.reserve(first.scope, first.grant), second.assembly.consumer.reserve(second.scope, second.grant)]);
        expect(race.filter(result => result.status === "fulfilled")).toHaveLength(1);
        const separate = await sqlAdmissionAuthority(other, { continuation: "flow.three", resources: ["fixture.separate-resource"] });
        const admitted = await separate.assembly.consumer.reserve(separate.scope, separate.grant);
        await separate.ports.producer.finish(admitted.root, separate.source.complete(separate.origin));
        await separate.assembly.consumer.release(admitted.reservation);
    }
    finally {
        await other.close();
        await pool.closeAll();
    }
}));
