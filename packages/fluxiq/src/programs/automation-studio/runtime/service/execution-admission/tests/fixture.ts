import { ClientGatewayService, CLIENT_GATEWAY_PROTOCOL_VERSION } from "../../../../../../client-gateway/index.ts";
import { ClientGatewayCommandContext as Context, ClientGatewayCommandLedgerController as Rules } from "../../../../../../client-gateway/service/command-ledger/index.ts";
import type { ExecutionObservationContext, ExecutionScopeAttestor } from "../../../../../../runtime/execution-admission/index.ts";
import { AdmissionTestSource } from "../../../../../../runtime/execution-admission/tests/source.ts";
import { AutomationStudioCommandExecutionController } from "../../command-execution/index.ts";
import { AutomationStudioExecutionAdmissionController } from "../index.ts";
import { sqlAdmissionFixture } from "../../../../storage/project/execution-admission/tests/fixture.ts";
export async function observedGatewayFixture(operation: (fixture: Awaited<ReturnType<typeof openObservedGatewayFixture>>) => Promise<void>, scopeAttestor?: ExecutionScopeAttestor): Promise<void> {
    await sqlAdmissionFixture(async (sql) => {
        const fixture = await openObservedGatewayFixture(sql, scopeAttestor);
        try {
            await operation(fixture);
        }
        finally {
            await fixture.gateway.close();
            await fixture.controller.close();
            await fixture.required.close();
        }
    });
}
async function openObservedGatewayFixture(sql: Parameters<Parameters<typeof sqlAdmissionFixture>[0]>[0], scopeAttestor?: ExecutionScopeAttestor) {
    const projectId = "project.isolated", flowId = "flow.actual";
    const lease = await sql.pool.acquire(projectId);
    try {
        await lease.database.run("insert into flows(flow_id,name,scope_kind,visibility,origin,source_mode,status,created_at_ms,updated_at_ms) values(?,'Isolated flow','project','project','user','visual','draft',1,1)", [flowId]);
    }
    finally {
        await lease.release();
    }
    const required = new AutomationStudioCommandExecutionController({ pool: sql.pool, getRuntimeSession: async () => null });
    const controller = new AutomationStudioExecutionAdmissionController({ pool: sql.pool, requiredOwner: required, getRuntimeSession: async () => null, ...(scopeAttestor ? { scopeAttestor } : {}) });
    const continuation = await controller.open({ projectId, flowId });
    const backend = new AdmissionTestSource(continuation.scope, "fixture.backend");
    backend.delegatesTo.push(backend.owner, continuation.gateway.owner);
    const originalOperations = new WeakMap<object, {
        parent: ExecutionObservationContext;
        owner: ReturnType<typeof Context.owner>;
    }>();
    const reader = { read(proof: object, parent: ExecutionObservationContext) {
            if (this !== reader)
                throw new Error("fixture.original_reader_receiver_lost");
            const operation = originalOperations.get(proof);
            return operation?.parent.parent === parent.parent && operation.parent.reservation === parent.reservation ? operation.owner : null;
        } };
    continuation.gateway.setProvenanceReader(reader);
    const ports = continuation.assembly.registerSource(backend);
    continuation.gateway.connect(continuation.assembly.registerSource(continuation.gateway.registration([])));
    const rootOrigin = backend.origin();
    const reserved = await continuation.assembly.consumer.reserve(continuation.scope, ports.issuer.fromOrdinaryAdmission(backend.admit(rootOrigin)));
    const run = await continuation.issueOrdinaryRunBinding(reserved.root);
    const origin = backend.origin();
    const entry = await ports.producer.enter({ reservation: reserved.reservation, parent: reserved.root }, origin);
    const parent = { reservation: reserved.reservation, parent: entry };
    let ordinal = 0;
    const bind = async () => {
        const actual = continuation.readOrdinaryRunBinding(run, parent);
        if (!actual)
            throw new Error("fixture.actual_root_binding_missing");
        const proof = Object.freeze({});
        originalOperations.set(proof, { parent, owner: { ...actual.owner, invocationId: `actual.invocation.${++ordinal}`, attemptId: "actual.attempt", effectOrdinal: ordinal } });
        return await continuation.gateway.bind(parent, proof);
    };
    const sends: Array<{
        commandId: string;
    }> = [];
    let acknowledge = true;
    const gateway = new ClientGatewayService({ resolveCommandLedger: context => controller.resolve(context), commandTimeoutMs: 2147483647 });
    const client = gateway.connect({ socket: { send(raw) {
                const envelope = JSON.parse(raw) as {
                    type: string;
                    payload: {
                        commandId: string;
                    };
                };
                if (envelope.type !== "server.execute_action")
                    return;
                sends.push(envelope.payload);
                if (acknowledge)
                    queueMicrotask(() => { void gateway.receive(client.sessionId, { id: `actual.answer.${sends.length}`, protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: Date.now(), type: "client.action_result", payload: { commandId: envelope.payload.commandId, status: "succeeded", payload: { isolatedSecret: "raw-result-must-not-enter-coverage" } } }); });
            } } });
    await gateway.receive(client.sessionId, { id: "actual.hello", protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: Date.now(), type: "client.hello", payload: { clientId: "isolated.actual-client", clientType: "extension", capabilities: [] } });
    const pairing = gateway.snapshot().pairings.find(item => item.requestedBySessionId === client.sessionId)!;
    await gateway.approvePairing(pairing.pairingCode, { approvedByUserId: "isolated.actual-user" });
    return { ...sql, projectId, flowId, required, controller, continuation, backend, ports, reserved, rootOrigin, run, origin, entry, parent, reader, gateway, client, sends, bind, acknowledge(value: boolean) { acknowledge = value; }, commandId(context: Context) { return Rules.commandId(Context.owner(context)); } };
}
