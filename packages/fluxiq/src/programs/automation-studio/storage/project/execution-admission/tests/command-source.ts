import type { ClientGatewayCommandClaim } from "../../../../../../client-gateway/service/command-ledger/index.ts";
import { ClientGatewayCommandLedgerController as Rules } from "../../../../../../client-gateway/service/command-ledger/index.ts";
import type { ExecutionOriginRecord } from "../../../../../../runtime/execution-admission/index.ts";
import { AdmissionTestSource } from "../../../../../../runtime/execution-admission/tests/source.ts";
export class SqlGatewayTestSource extends AdmissionTestSource {
    private readonly commandOrigins = new WeakMap<object, ExecutionOriginRecord>();
    originFor(claim: ClientGatewayCommandClaim): object {
        const origin = Object.freeze({});
        const owner = { projectId: claim.binding.projectId, runId: claim.binding.runId, flowId: claim.binding.flowId, invocationId: claim.binding.invocationId, attemptId: claim.binding.attemptId, effectOrdinal: claim.binding.effectOrdinal };
        this.commandOrigins.set(origin, { sourceKey: this.sourceKey, operationKey: claim.binding.commandId, runId: owner.runId, invocationId: owner.invocationId, attemptId: owner.attemptId, bindingDigest: Rules.digest(owner) });
        return origin;
    }
    override readOrigin(origin: object): ExecutionOriginRecord | null {
        return this.commandOrigins.get(origin) ?? super.readOrigin(origin);
    }
}
