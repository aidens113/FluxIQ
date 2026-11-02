import { ClientGatewayCommandContext } from "../../../../client-gateway/service/command-ledger/index.ts";
import type { PreparedOutputInvocation } from "./prepared.ts";
import { OutputAdmissionState } from "./state.ts";

export async function bindOutputGateway(handle: PreparedOutputInvocation, existingContext?: ClientGatewayCommandContext): Promise<ClientGatewayCommandContext | undefined> {
  const state = OutputAdmissionState.invocations.get(handle);
  if (!state) throw new Error("execution_observation.foreign_output_invocation");
  const { operation } = state;
  if (!state.state.gateway) return existingContext;
  if (!existingContext && (typeof operation.receiver !== "object" || operation.receiver === null || !state.state.targets.get(operation.receiver)?.has(operation.callback))) return undefined;
  if (!state.state.provenanceReader.read(handle, operation.parent)) return existingContext;
  const context = await state.state.gateway(operation.parent, handle, existingContext);
  if (existingContext && context !== existingContext) throw new Error("execution_observation.required_context_replaced");
  ClientGatewayCommandContext.owner(context);
  operation.context = context;
  return context;
}
