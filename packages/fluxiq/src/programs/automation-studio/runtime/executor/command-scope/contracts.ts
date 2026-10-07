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
};
export type AutomationStudioExecutorNodeEntry = {
  readonly run: AutomationStudioExecutorCommandRun; readonly invocationId: string; readonly attemptId: string;
  readonly nodeId: string; readonly executingFlowId: string; readonly executingFlowDigest: string;
};
