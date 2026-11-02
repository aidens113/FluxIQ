// @fluxiq-test-group real-sql
import { expect, it, vi } from "vitest";
import { ClientGatewayCommandOutcome as Outcome } from "../../../../../../client-gateway/service/command-ledger/index.ts";
import { AutomationStudioProjectExecutionAdmissionStore as Store } from "../../../../storage/project/execution-admission/index.ts";
import { observedGatewayFixture } from "./fixture.ts";
it("observes an actual client delivery on the original backend parent with a genuine persisted root run", async () => observedGatewayFixture(async (h) => {
    expect((await h.continuation.assembly.consumer.inspect(h.continuation.scope)).state).toBe("pending");
    const context = await h.bind();
    expect(h.continuation.gateway.readCompletion(context, h.parent)).toBe("pending");
    expect(h.continuation.gateway.readCompletion(context, { ...h.parent })).toBe("unknown");
    expect(h.continuation.gateway.readCompletion(Object.create(context), h.parent)).toBe("unknown");
    expect(h.controller.owns(context)).toBe(true);
    expect(h.required.owns(context)).toBe(false);
    expect(() => h.continuation.gateway.setProvenanceReader(h.reader)).toThrow("reader_rebound");
    expect(() => Outcome.observer(context)!.completed(Object.freeze({}))).toThrow("foreign_completion_proof");
    const response = h.gateway.executeAction(h.client.sessionId, { actionType: "isolated.actual-act", parameters: { isolatedSecret: "raw-action-must-not-enter-coverage" } }, { context });
    expect(await response.result).toMatchObject({ status: "completed" });
    expect(h.continuation.gateway.readCompletion(context, h.parent)).toBe("settled");
    expect(h.sends).toHaveLength(1);
    await h.ports.producer.finish(h.entry, h.backend.complete(h.origin));
    await h.ports.producer.finish(h.reserved.root, h.backend.complete(h.rootOrigin));
    await h.continuation.assembly.consumer.release(h.reserved.reservation);
    expect(h.continuation.gateway.readCompletion(context, h.parent)).toBe("unknown");
    expect((await h.continuation.assembly.consumer.inspect(h.continuation.scope)).state).toBe("unverified");
    const lease = await h.pool.acquire(h.projectId);
    try {
        expect(await lease.database.get("select count(*) as count from execution_admission_command_links")).toEqual({ count: 1 });
        const facts = await lease.database.all<{
            data_json: string;
        }>("select data_json from execution_admission_facts");
        expect(facts).toHaveLength(1);
        const events = await lease.database.all("select request_json,changes_json from execution_admission_events");
        expect(JSON.stringify(events)).not.toContain("raw-action-must-not-enter-coverage");
        expect(JSON.stringify(events)).not.toContain("raw-result-must-not-enter-coverage");
    }
    finally {
        await lease.release();
    }
}));
it("keeps a sent lost-ACK command pending after release and independent reopen without a second send", async () => observedGatewayFixture(async (h) => {
    h.acknowledge(false);
    const context = await h.bind(), abort = new AbortController();
    const response = h.gateway.executeAction(h.client.sessionId, { actionType: "isolated.counter-act" }, { context, signal: abort.signal });
    await vi.waitFor(() => expect(h.sends).toHaveLength(1));
    abort.abort();
    expect(await response.result).toEqual({ status: "outcome_unknown" });
    await h.continuation.assembly.consumer.release(h.reserved.reservation);
    const reopened = await Store.open({ pool: h.pool, projectId: h.projectId });
    try {
        const snapshot = await h.continuation.assembly.consumer.inspect(h.continuation.scope);
        expect(snapshot.state).toBe("pending");
        expect(await reopened.inspect(h.continuation.assembly.entryBridge.read(h.reserved.root).row.scopeId)).toMatchObject({ state: "pending" });
        const next = h.backend.origin();
        await expect(h.continuation.assembly.consumer.reserve(h.continuation.scope, h.ports.issuer.fromOrdinaryAdmission(h.backend.admit(next)))).rejects.toThrow("execution_blocked");
        expect(h.sends).toHaveLength(1);
    }
    finally {
        await reopened.close();
    }
}));
it("retains open coverage when the actual committed receipt observer cannot persist delivery", async () => observedGatewayFixture(async (h) => {
    const context = await h.bind();
    const database = await h.pool.acquire(h.projectId);
    await database.database.run("create trigger reject_observed_delivery before insert on execution_admission_facts when json_extract(new.data_json,'$.evidence.kind')='command_delivery' begin select raise(abort,'isolated delivery write failure'); end");
    try {
        expect(await h.gateway.executeAction(h.client.sessionId, { actionType: "isolated.actual-act" }, { context }).result).toEqual({ status: "outcome_unknown" });
        expect(h.sends).toHaveLength(1);
        await h.continuation.assembly.consumer.release(h.reserved.reservation);
        const reopened = await Store.open({ pool: h.pool, projectId: h.projectId });
        try {
            expect(await reopened.inspect(h.continuation.assembly.entryBridge.read(h.reserved.root).row.scopeId)).toMatchObject({ state: "pending" });
        }
        finally {
            await reopened.close();
        }
        const lease = await h.pool.acquire(h.projectId);
        try {
            expect(await lease.database.get("select count(*) as count from gateway_command_receipts")).toEqual({ count: 1 });
        }
        finally {
            await lease.release();
        }
    }
    finally {
        await database.database.run("drop trigger if exists reject_observed_delivery");
        await database.release();
    }
}));
it("authenticates a pre-claim permanent revocation without pretending a running command did nothing", async () => observedGatewayFixture(async (h) => {
    const context = await h.bind();
    await Outcome.stop(context, "isolated_not_invoked");
    expect(await h.gateway.executeAction(h.client.sessionId, { actionType: "isolated.never-sent" }, { context }).result).toEqual({ status: "outcome_unknown" });
    expect(h.sends).toHaveLength(0);
    await h.ports.producer.finish(h.entry, h.backend.complete(h.origin));
    await h.ports.producer.finish(h.reserved.root, h.backend.complete(h.rootOrigin));
    await h.continuation.assembly.consumer.release(h.reserved.reservation);
    expect((await h.continuation.assembly.consumer.inspect(h.continuation.scope)).state).toBe("unverified");
}));
it("rejects copied ordinary run proofs and foreign reservation/parent associations", async () => observedGatewayFixture(async (h) => {
    const copy = Object.create(Object.getPrototypeOf(h.run), Object.getOwnPropertyDescriptors(h.run));
    expect(h.continuation.readOrdinaryRunBinding(copy, h.parent)).toBeNull();
    expect(h.continuation.readOrdinaryRunBinding(h.run, { ...h.parent, reservation: Object.create(Object.getPrototypeOf(h.reserved.reservation)) })).toBeNull();
    const entryCopy = Object.create(Object.getPrototypeOf(h.entry), Object.getOwnPropertyDescriptors(h.entry));
    expect(h.continuation.readOrdinaryRunBinding(h.run, { ...h.parent, parent: entryCopy })).toBeNull();
    await expect(h.continuation.gateway.bind(h.parent, Object.freeze({}))).rejects.toThrow("provenance_unverified");
    expect(h.sends).toHaveLength(0);
    await h.continuation.assembly.consumer.release(h.reserved.reservation);
    expect(h.continuation.readOrdinaryRunBinding(h.run, h.parent)).toBeNull();
}));
it("drains an actual held post-receipt observer before closing its SQL owner and preserves pending truth", async () => observedGatewayFixture(async (h) => {
    // Replacing the reader's method cannot replace the original configured function/receiver.
    h.reader.read = () => { throw new Error("replacement reader executed"); };
    const context = await h.bind();
    let release!: () => void, arrived!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const observing = new Promise<void>(resolve => { arrived = resolve; });
    const original = Store.prototype.validateOriginalEntry;
    let stopped = false, closed = false;
    const validate = vi.spyOn(Store.prototype, "validateOriginalEntry").mockImplementation(function (this: Store, bridge, entry) {
        if (h.sends.length && !stopped) {
            stopped = true;
            arrived();
            return held.then(() => original.call(this, bridge, entry));
        }
        return original.call(this, bridge, entry);
    });
    try {
        const response = h.gateway.executeAction(h.client.sessionId, { actionType: "isolated.actual-act" }, { context });
        const result = response.result.then(value => ({ value }), error => ({ error }));
        await observing;
        const closing = h.controller.close().then(() => { closed = true; });
        await Promise.resolve();
        expect(closed).toBe(false);
        release();
        await closing;
        expect(await result).not.toMatchObject({ value: { status: "completed" } });
        expect(closed).toBe(true);
        expect(h.sends).toHaveLength(1);
        const scopeId = h.continuation.assembly.entryBridge.read(h.reserved.root).row.scopeId;
        expect(await h.store.inspect(scopeId)).toMatchObject({ state: "pending" });
        expect(() => h.controller.resolve(context)).toThrow("storage_unavailable");
    }
    finally {
        release();
        validate.mockRestore();
    }
}));
