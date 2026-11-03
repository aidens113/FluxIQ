// @fluxiq-test-group real-sql
import { expect, it } from "vitest";
import { ClientGatewayCommandLedgerController as Rules, type ClientGatewayCommandClaim, type ClientGatewayCommandReceipt } from "../../../../../../client-gateway/service/command-ledger/index.ts";
import type { ExecutionSourcePorts } from "../../../../../../runtime/execution-admission/index.ts";
import { AutomationStudioProjectCommandLedgerStore } from "../../../../../../framework/persistence/project/command-ledger/index.ts";
import { sqlAdmissionAuthority, sqlAdmissionFixture } from "./fixture.ts";
import { SqlGatewayTestSource } from "./command-source.ts";
import { AutomationStudioProjectExecutionAdmissionStore } from "../../../../../../framework/persistence/project/execution-admission/index.ts";
it("links the one real claim atomically and retains open coverage after a committed receipt without its observer", async () => sqlAdmissionFixture(async ({ store, pool }) => {
    let gateway!: SqlGatewayTestSource;
    let ports!: ExecutionSourcePorts;
    const actual = await sqlAdmissionAuthority(store, { configure(assembly, scope, source) {
            gateway = new SqlGatewayTestSource(scope, "fixture.gateway");
            source.delegatesTo.push(gateway.owner);
            ports = assembly.registerSource(gateway);
        } });
    const reserved = await actual.assembly.consumer.reserve(actual.scope, actual.grant);
    const owner = { projectId: "project.isolated", runId: actual.assembly.entryBridge.read(reserved.root).row.entryId, flowId: "flow.actual", invocationId: "actual.invocation", attemptId: "actual.attempt", effectOrdinal: 0 };
    const claim: ClientGatewayCommandClaim = { binding: { schemaVersion: "gateway_command.v1", ...owner, commandId: Rules.commandId(owner), clientId: "fixture.actual-client", sessionId: "fixture.actual-session" }, requestDigest: `sha256:${"a".repeat(64)}` };
    const origin = gateway.originFor(claim);
    const entry = await ports.producer.enter({ reservation: reserved.reservation, parent: reserved.root }, origin);
    const ledger = await AutomationStudioProjectCommandLedgerStore.open({ pool, projectId: owner.projectId });
    ledger.bindExecutionAdmission(store.commandLink(actual.assembly.entryBridge, gateway.owner));
    try {
        expect(await ledger.claimForExecution(claim, entry)).toMatchObject({ sendAllowed: true, record: { state: "pending" } });
        expect(await ledger.claimForExecution(claim, entry)).toMatchObject({ sendAllowed: false });
        const receipt: ClientGatewayCommandReceipt = { schemaVersion: "gateway_command_receipt.v1", commandId: claim.binding.commandId, requestDigest: claim.requestDigest, clientId: claim.binding.clientId, sessionId: claim.binding.sessionId, status: "succeeded", receivedAt: Date.now(), resultDigest: `sha256:${"b".repeat(64)}`, redaction: "receipt_only" };
        await ledger.commitReceipt(claim, receipt);
        expect((await actual.assembly.consumer.inspect(actual.scope)).state).toBe("pending");
        await actual.assembly.consumer.release(reserved.reservation);
        const next = await sqlAdmissionAuthority(store, { series: true, runId: "new.actual-run" });
        await expect(next.assembly.consumer.reserve(next.scope, next.grant)).rejects.toThrow("execution_blocked");
        const lease = await pool.acquire(owner.projectId);
        try {
            expect(await lease.database.get("select count(*) as count from gateway_command_claims")).toEqual({ count: 1 });
            expect(await lease.database.get("select count(*) as count from gateway_command_receipts")).toEqual({ count: 1 });
            expect(await lease.database.get("select count(*) as count from execution_admission_command_links")).toEqual({ count: 1 });
        }
        finally {
            await lease.release();
        }
    }
    finally {
        await ledger.close();
    }
}));
it("refuses a copied entry capability before a claim and rolls back the link together with a rejected claim", async () => sqlAdmissionFixture(async ({ store, pool }) => {
    let gateway!: SqlGatewayTestSource;
    let ports!: ExecutionSourcePorts;
    const actual = await sqlAdmissionAuthority(store, { configure(assembly, scope, source) {
            gateway = new SqlGatewayTestSource(scope, "fixture.gateway");
            source.delegatesTo.push(gateway.owner);
            ports = assembly.registerSource(gateway);
        } });
    const reserved = await actual.assembly.consumer.reserve(actual.scope, actual.grant);
    const owner = { projectId: "project.isolated", runId: actual.assembly.entryBridge.read(reserved.root).row.entryId, flowId: "flow.actual", invocationId: "actual.invocation", attemptId: "actual.attempt", effectOrdinal: 0 };
    const claim: ClientGatewayCommandClaim = { binding: { schemaVersion: "gateway_command.v1", ...owner, commandId: Rules.commandId(owner), clientId: "fixture.actual-client", sessionId: "fixture.actual-session" }, requestDigest: `sha256:${"c".repeat(64)}` };
    const entry = await ports.producer.enter({ reservation: reserved.reservation, parent: reserved.root }, gateway.originFor(claim));
    const ledger = await AutomationStudioProjectCommandLedgerStore.open({ pool, projectId: owner.projectId });
    ledger.bindExecutionAdmission(store.commandLink(actual.assembly.entryBridge, gateway.owner));
    const lease = await pool.acquire(owner.projectId);
    try {
        const copied = Object.create(Object.getPrototypeOf(entry), Object.getOwnPropertyDescriptors(entry));
        expect(() => ledger.claimForExecution(claim, copied)).toThrow("foreign_entry");
        await lease.database.run("create trigger reject_admission_claim before insert on gateway_command_claims begin select raise(abort,'isolated claim rejection'); end");
        await expect(ledger.claimForExecution(claim, entry)).rejects.toThrow("isolated claim rejection");
        expect(await lease.database.get("select count(*) as count from gateway_command_claims")).toEqual({ count: 0 });
        expect(await lease.database.get("select count(*) as count from execution_admission_command_links")).toEqual({ count: 0 });
        expect((await actual.assembly.consumer.inspect(actual.scope)).state).toBe("pending");
    }
    finally {
        await lease.database.run("drop trigger if exists reject_admission_claim");
        await lease.release();
        await ledger.close();
    }
}));
it("retains the required historical unknown latch even after a genuine late receipt and independent reopen", async () => sqlAdmissionFixture(async ({ store, pool }) => {
    let gateway!: SqlGatewayTestSource;
    let ports!: ExecutionSourcePorts;
    const actual = await sqlAdmissionAuthority(store, { configure(assembly, scope, source) {
            gateway = new SqlGatewayTestSource(scope, "fixture.gateway");
            source.delegatesTo.push(gateway.owner);
            ports = assembly.registerSource(gateway);
        } });
    const reserved = await actual.assembly.consumer.reserve(actual.scope, actual.grant);
    const owner = { projectId: "project.isolated", runId: actual.assembly.entryBridge.read(reserved.root).row.entryId, flowId: "flow.actual", invocationId: "actual.invocation", attemptId: "actual.attempt", effectOrdinal: 0 };
    const claim: ClientGatewayCommandClaim = { binding: { schemaVersion: "gateway_command.v1", ...owner, commandId: Rules.commandId(owner), clientId: "fixture.actual-client", sessionId: "fixture.actual-session" }, requestDigest: `sha256:${"d".repeat(64)}` };
    const origin = gateway.originFor(claim);
    const entry = await ports.producer.enter({ reservation: reserved.reservation, parent: reserved.root }, origin);
    const ledger = await AutomationStudioProjectCommandLedgerStore.open({ pool, projectId: owner.projectId });
    ledger.bindExecutionAdmission(store.commandLink(actual.assembly.entryBridge, gateway.owner));
    try {
        const admission = await ledger.openRunAdmission(owner.runId);
        expect((await ledger.claimForExecution(claim, entry, admission)).sendAllowed).toBe(true);
        await ledger.markUnknown(claim, "send_uncertain");
        const receipt: ClientGatewayCommandReceipt = { schemaVersion: "gateway_command_receipt.v1", commandId: claim.binding.commandId, requestDigest: claim.requestDigest, clientId: claim.binding.clientId, sessionId: claim.binding.sessionId, status: "succeeded", receivedAt: Date.now(), resultDigest: `sha256:${"e".repeat(64)}`, redaction: "receipt_only" };
        expect((await ledger.commitReceipt(claim, receipt)).state).toBe("committed");
        await ports.producer.observe(entry, gateway.prove(origin, { kind: "command_delivery", commandId: claim.binding.commandId, claimDigest: Rules.digest(claim), receiptDigest: Rules.digest(receipt) }));
        await expect(ports.producer.observe(entry, gateway.prove(origin, { kind: "required_consumed", commandId: claim.binding.commandId, handlingDigest: "caller.supplied.no-authority" }))).rejects.toThrow("unverified_consumption");
        await expect(store.finish({ entryId: actual.assembly.entryBridge.read(entry).row.entryId, evidence: { kind: "coverage_complete", disposition: "settled", completionDigest: "late.receipt", assessmentDigest: "late.receipt.is.not.handling" } })).rejects.toThrow("required_not_consumed");
        await actual.assembly.consumer.release(reserved.reservation);
        const reopened = await AutomationStudioProjectExecutionAdmissionStore.open({ pool, projectId: owner.projectId });
        try {
            expect(await reopened.inspect(actual.assembly.entryBridge.read(reserved.root).row.scopeId)).toMatchObject({ state: "required_latched" });
        }
        finally {
            await reopened.close();
        }
        const next = await sqlAdmissionAuthority(store, { series: true, runId: "actual.new-run", epoch: "actual.new-epoch" });
        await expect(next.assembly.consumer.reserve(next.scope, next.grant)).rejects.toThrow("execution_blocked");
    }
    finally {
        await ledger.close();
    }
}));

it("rolls back the staged claim, link and proof when the claim mutation cannot commit", async () => sqlAdmissionFixture(async ({ store, pool }) => {
    let gateway!: SqlGatewayTestSource;
    let ports!: ExecutionSourcePorts;
    const actual = await sqlAdmissionAuthority(store, { configure(assembly, scope, source) {
            gateway = new SqlGatewayTestSource(scope, "fixture.gateway");
            source.delegatesTo.push(gateway.owner);
            ports = assembly.registerSource(gateway);
        } });
    const reserved = await actual.assembly.consumer.reserve(actual.scope, actual.grant);
    const owner = { projectId: "project.isolated", runId: actual.assembly.entryBridge.read(reserved.root).row.entryId, flowId: "flow.actual", invocationId: "actual.invocation", attemptId: "actual.attempt", effectOrdinal: 0 };
    const claim: ClientGatewayCommandClaim = { binding: { schemaVersion: "gateway_command.v1", ...owner, commandId: Rules.commandId(owner), clientId: "fixture.actual-client", sessionId: "fixture.actual-session" }, requestDigest: `sha256:${"f".repeat(64)}` };
    const entry = await ports.producer.enter({ reservation: reserved.reservation, parent: reserved.root }, gateway.originFor(claim));
    const ledger = await AutomationStudioProjectCommandLedgerStore.open({ pool, projectId: owner.projectId });
    ledger.bindExecutionAdmission(store.commandLink(actual.assembly.entryBridge, gateway.owner));
    const lease = await pool.acquire(owner.projectId);
    let sends = 0;
    try {
        await lease.database.run(`create trigger reject_linked_claim_commit before update of status on mutation_records
            when new.owner_kind='gateway_command' and new.operation_kind='gateway_command.claim' and new.status='committed'
            begin
                select case when not exists(select 1 from gateway_command_claims where command_id=new.owner_id)
                    or not exists(select 1 from execution_admission_command_links where command_id=new.owner_id)
                    or not exists(select 1 from execution_admission_events where mutation_id=new.mutation_id and operation='command_link')
                    then raise(abort,'isolated linked claim was not staged') end;
                select raise(abort,'isolated linked claim commit rejection');
            end`);
        const sent = ledger.claimForExecution(claim, entry).then(result => {
            if (result.sendAllowed) sends++;
            return result;
        });
        await expect(sent).rejects.toThrow("isolated linked claim commit rejection");
        expect(sends).toBe(0);
        expect(await lease.database.get("select count(*) as count from gateway_command_claims")).toEqual({ count: 0 });
        expect(await lease.database.get("select count(*) as count from execution_admission_command_links")).toEqual({ count: 0 });
        expect(await lease.database.get("select count(*) as count from execution_admission_events where operation='command_link'")).toEqual({ count: 0 });
        expect((await actual.assembly.consumer.inspect(actual.scope)).state).toBe("pending");
    }
    finally {
        await lease.database.run("drop trigger if exists reject_linked_claim_commit");
        await lease.release();
        await ledger.close();
    }
}));
