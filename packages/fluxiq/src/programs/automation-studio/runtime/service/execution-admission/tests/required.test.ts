// @fluxiq-test-group real-sql
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { FluxIQ } from "../../../../../../framework/index.ts";
import { ClientGatewayService, CLIENT_GATEWAY_PROTOCOL_VERSION } from "../../../../../../client-gateway/index.ts";
import { ClientGatewayCommandContext as Context, ClientGatewayCommandOutcome as Outcome } from "../../../../../../client-gateway/service/command-ledger/index.ts";
import { IoRegistry, defineOutput } from "../../../../../../io/index.ts";
import { AdmissionTestSource } from "../../../../../../runtime/execution-admission/tests/source.ts";
import { runAutomationStudioGraph } from "../../../executor.ts";
import { createIoPolicyEffectDispatcher } from "../../../io-policy.ts";
import { AutomationStudioCommandExecutionController } from "../../command-execution/index.ts";
import { AutomationStudioExecutionAdmissionController } from "../index.ts";
import type { AutomationStudioProjectDatabasePool } from "../../../../storage/project/index.ts";
import type { AutomationStudioFlowDocument } from "../../../../model/index.ts";
it.each(["consumed", "consume_write_failed", "lost_ack"] as const)("joins actual executor handling and sole required observer: %s", async (kind) => {
    const root = await mkdtemp(path.join(os.tmpdir(), "required-admission-"));
    const bootstrap = FluxIQ.create({ rootDir: root, loadEnv: false, modelProvidersEnabled: false });
    for (const [key, value] of Object.entries(bootstrap.paths))
        if (key !== "domainId" && typeof value === "string") {
            const relative = path.relative(root, path.resolve(value));
            if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
                throw new Error("nonowned fixture path");
        }
    try {
        await bootstrap.setup();
    }
    finally {
        await bootstrap.close();
    }
    const fluxiq = FluxIQ.create({ rootDir: root, loadEnv: false, modelProvidersEnabled: false });
    const program = fluxiq.programs.automationStudio;
    const pool = (program as unknown as {
        projectDatabasePool: AutomationStudioProjectDatabasePool;
    }).projectDatabasePool;
    const getRuntimeSession = (projectId: string, runId: string) => program.getRuntimeSession(projectId, runId);
    const required = new AutomationStudioCommandExecutionController({ pool, getRuntimeSession });
    const controller = new AutomationStudioExecutionAdmissionController({ pool, requiredOwner: required, getRuntimeSession });
    const deadlines: AbortController[] = [], sent: string[] = [];
    const gateway = new ClientGatewayService({ resolveCommandLedger: context => required.owns(context) ? required.resolve(context) : controller.resolve(context), commandTimeoutMs: 2147483647 });
    const client = gateway.connect({ socket: { send(raw) {
                const message = JSON.parse(raw) as {
                    type: string;
                    payload: {
                        commandId: string;
                    };
                };
                if (message.type !== "server.execute_action")
                    return;
                sent.push(message.payload.commandId);
                if (kind === "lost_ack")
                    queueMicrotask(() => {
                        for (const deadline of deadlines)
                            deadline.abort();
                    });
                else
                    queueMicrotask(() => { void gateway.receive(client.sessionId, { id: "actual.answer", protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: Date.now(), type: "client.action_result", payload: { commandId: message.payload.commandId, status: "succeeded", payload: { isolated: true } } }); });
            } } });
    let sql: Awaited<ReturnType<AutomationStudioProjectDatabasePool["acquire"]>> | undefined;
    try {
        await gateway.receive(client.sessionId, { id: "actual.hello", protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: Date.now(), type: "client.hello", payload: { clientId: "isolated.required-client", clientType: "extension", capabilities: [] } });
        const pairing = gateway.snapshot().pairings.find(item => item.requestedBySessionId === client.sessionId)!;
        await gateway.approvePairing(pairing.pairingCode, { approvedByUserId: "isolated.actual-user" });
        const project = await program.createProject({ name: "Isolated actual required handling", domainId: "isolated.domain" });
        const flow: AutomationStudioFlowDocument = { schemaVersion: "0.1", flowId: "flow.actual", ownerKind: "routine", ownerId: "routine.actual", name: "Isolated act", createdAt: 1, updatedAt: 1, nodes: [{ id: "actual.node", definitionId: "builtin.policy.action", parameterValues: { outputId: "isolated.actual-act", parameters: {} } }], edges: [] };
        await program.createFlow({ projectId: project.id, flowId: flow.flowId, name: flow.name });
        await program.saveFlowGenerationInstruction({ projectId: project.id, flowId: flow.flowId, instruction: "Perform the isolated action once." });
        const session = await program.startRuntimeSession({ projectId: project.id, runId: "actual.required-run", flow });
        const continuation = await controller.open({ projectId: project.id, flowId: flow.flowId });
        const backend = new AdmissionTestSource(continuation.scope, "fixture.actual-backend");
        backend.delegatesTo.push(backend.owner, continuation.gateway.owner);
        const originalOperations = new WeakMap<object, Context>();
        let parent!: import("../../../../../../runtime/execution-admission/index.ts").ExecutionObservationContext;
        continuation.gateway.setProvenanceReader({ read(proof, current) {
                const context = originalOperations.get(proof);
                return context && current.parent === parent.parent && current.reservation === parent.reservation ? Context.owner(context) : null;
            } });
        const ports = continuation.assembly.registerSource(backend);
        continuation.gateway.connect(continuation.assembly.registerSource(continuation.gateway.registration([])));
        const origin = backend.origin();
        const reserved = await continuation.assembly.consumer.reserve(continuation.scope, ports.issuer.fromOrdinaryAdmission(backend.admit(origin)));
        const backendOrigin = backend.origin();
        const backendEntry = await ports.producer.enter({ reservation: reserved.reservation, parent: reserved.root }, backendOrigin);
        parent = { reservation: reserved.reservation, parent: backendEntry };
        sql = await pool.acquire(project.id);
        if (kind === "consume_write_failed")
            await sql.database.run("create trigger reject_required_consumption before insert on execution_admission_facts when json_extract(new.data_json,'$.evidence.kind')='required_consumed' begin select raise(abort,'isolated handling write failure'); end");
        const io = new IoRegistry();
        io.registerOutput("isolated.domain", defineOutput({ definition: { id: "isolated.actual-act", title: "Isolated act" }, mode: "request", dispatch: async () => { throw new Error("legacy path executed"); }, dispatchWithCommandContext: async (request) => {
                const context = request.commandContext!, observer = Outcome.observer(context);
                const proof = Object.freeze({});
                originalOperations.set(proof, context);
                expect(await continuation.gateway.bind(parent, proof, context)).toBe(context);
                expect(Outcome.observer(context)).toBe(observer);
                expect(() => controller.consumed(context, Object.freeze({}))).toThrow("foreign_consumption");
                const abort = new AbortController();
                deadlines.push(abort);
                const result = await gateway.executeAction(client.sessionId, { actionType: "isolated.actual-act" }, { context, signal: abort.signal }).result;
                if (result.status !== "completed")
                    throw new Error("isolated actual unknown");
                const facts = await sql!.database.all<{
                    data_json: string;
                }>("select data_json from execution_admission_facts");
                expect(facts.some(fact => JSON.parse(fact.data_json).evidence.kind === "required_consumed")).toBe(false);
                return { outputId: request.outputId, ok: true, payload: { isolated: true } };
            } }));
        const run = await required.open({ projectId: project.id, runId: session.runId, rootFlowId: session.flowId });
        const trace = await runAutomationStudioGraph(flow, { commandRun: run, signal: run.signal, effectDispatcher: createIoPolicyEffectDispatcher(io, "isolated.domain") });
        expect(trace.status).toBe(kind === "consumed" ? "succeeded" : "failed");
        expect(sent).toHaveLength(1);
        if (kind === "consumed") {
            await ports.producer.finish(backendEntry, backend.complete(backendOrigin));
            await ports.producer.finish(reserved.root, backend.complete(origin));
            const facts = await sql.database.all<{
                data_json: string;
            }>("select data_json from execution_admission_facts");
            expect(facts.map(fact => JSON.parse(fact.data_json).evidence.kind).sort()).toEqual(["command_delivery", "required_consumed"]);
        }
        await continuation.assembly.consumer.release(reserved.reservation);
        expect((await continuation.assembly.consumer.inspect(continuation.scope)).state).toBe(kind === "consumed" ? "unverified" : kind === "lost_ack" ? "required_latched" : "pending");
        expect(await sql.database.get("select count(*) as count from gateway_command_receipts")).toEqual({ count: kind === "lost_ack" ? 0 : 1 });
        expect(await sql.database.get("select count(*) as count from execution_admission_command_links")).toEqual({ count: 1 });
    }
    finally {
        if (sql) {
            await sql.database.run("drop trigger if exists reject_required_consumption");
            await sql.release();
        }
        await gateway.close();
        await controller.close();
        await required.close();
        await fluxiq.close();
        const owned = path.resolve(root);
        if (path.dirname(owned) !== path.resolve(os.tmpdir()) || !path.basename(owned).startsWith("required-admission-"))
            throw new Error("nonowned fixture cleanup");
        await rm(owned, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    }
});
