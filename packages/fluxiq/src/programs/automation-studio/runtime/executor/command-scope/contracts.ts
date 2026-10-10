import type { ClientGatewayCommandContext } from "../../../../../client-gateway/service/command-ledger/index.ts";
/** Executor-only collaborator; never serialized into node/action data. */
export type AutomationStudioExecutorCommandRun = {
  readonly signal: AbortSignal;
  acceptsComposite(callback: object): boolean;
  own<T>(start: () => Promise<T>): Promise<T>;
  checkpoint(): Promise<void>;
  context(consumer: object, ordinal: number): Promise<{ capability: object; context: ClientGatewayCommandContext }>;
  consume(consumer: object, capability: object, context: ClientGatewayCommandContext): Promise<void>;
  stop(reason: string): Promise<void>;
  /**
   * Whether the command issued under `context` came back with a committed
   * receipt. A dispatch that answered without one left its outcome unknown:
   * the run is latched (no command, checkpoint or consumption succeeds after
   * it) and stops there as Outcome uncertain (`../step-loop/uncertain-stop.ts`).
   */
  receipted(context: ClientGatewayCommandContext): boolean;
};
export type AutomationStudioExecutorNodeEntry = {
  readonly run: AutomationStudioExecutorCommandRun; readonly invocationId: string; readonly attemptId: string;
  readonly nodeId: string; readonly executingFlowId: string; readonly executingFlowDigest: string;
};
