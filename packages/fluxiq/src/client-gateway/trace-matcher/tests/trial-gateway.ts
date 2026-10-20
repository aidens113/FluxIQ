// Test support for the trace matcher: a trial gateway whose scoped session is a
// matcher over a recorded trace, with a clock that waits the time it is asked
// to move and a gateway port that keeps every text it is fed.

import {
  CLIENT_GATEWAY_PROTOCOL_VERSION,
  ClientGatewayService,
  ClientGatewayTraceMatcher,
  type ClientGatewayActionCommand,
  type ClientGatewayActionResult,
  type ClientGatewayClientHello,
  type ClientGatewaySession,
  type ClientGatewayTraceMatcherGateway,
  type ClientGatewayTraceStore
} from "../../index.ts";
import type { ClientGatewayChannelScopeSource } from "../../service/channel-scope/index.ts";

export const TRIAL_SCOPE = "scope.trial";
export const PROTOCOL = { protocol: CLIENT_GATEWAY_PROTOCOL_VERSION };

/** A scope the test enters by hand around each dispatch, standing in for the host's async-context scope. */
function manualScope(): ClientGatewayChannelScopeSource & { enter(scopeId: string | undefined): void } {
  let current: string | undefined;
  return { current: () => current, enter: (scopeId) => { current = scopeId; } };
}

export type Trial = {
  gateway: ClientGatewayService;
  matcher: ClientGatewayTraceMatcher;
  session: ClientGatewaySession;
  /** Every text the matcher handed the gateway, in order. */
  fed: string[];
  /** Every amount the matcher moved the clock by, in order. */
  advances: number[];
  /** Runs after each fed text has been taken in. */
  afterFeed: { current: ((text: string) => void) | undefined };
  execute(command: ClientGatewayActionCommand): Promise<ClientGatewayActionResult>;
  close(): Promise<void>;
};

/** A trial gateway with the matcher over `traceId` attached under the trial scope, with the view the trace recorded, else `sessionView`. */
export async function openTrial(input: { store: ClientGatewayTraceStore; traceId: string; contractVersions?: Readonly<Record<string, string>>; commandTimeoutMs?: number; sessionView?: ClientGatewayClientHello }): Promise<Trial> {
  const scope = manualScope();
  const gateway = new ClientGatewayService({ commandTimeoutMs: input.commandTimeoutMs ?? 60_000, reconcileAnswerMs: 5_000, channelScope: scope });
  const fed: string[] = [];
  const advances: number[] = [];
  const afterFeed: Trial["afterFeed"] = { current: undefined };
  const port: ClientGatewayTraceMatcherGateway = {
    attachScopedSession: (attach) => gateway.attachScopedSession(attach),
    receiveRaw: async (sessionId, text) => {
      fed.push(text);
      await gateway.receiveRaw(sessionId, text);
      afterFeed.current?.(text);
    },
    receiveTraceArtifact: (sessionId, upload) => gateway.receiveTraceArtifact(sessionId, upload)
  };
  const clock = {
    advance: async (ms: number) => {
      advances.push(ms);
      await new Promise((resolve) => setTimeout(resolve, ms));
    }
  };
  const matcher = await ClientGatewayTraceMatcher.load({ store: input.store, traceId: input.traceId, gateway: port, clock, contractVersions: input.contractVersions ?? PROTOCOL });
  const session = matcher.attach(TRIAL_SCOPE, input.sessionView);
  const execute = (command: ClientGatewayActionCommand): Promise<ClientGatewayActionResult> => {
    scope.enter(TRIAL_SCOPE);
    try {
      return gateway.executeAction(session.sessionId, command).result;
    } finally {
      scope.enter(undefined);
    }
  };
  return { gateway, matcher, session, fed, advances, afterFeed, execute, close: () => gateway.close() };
}

/** A result without the command id the gateway minted for it, to compare a trial's answer with the recorded one. */
export function withoutCommandId(result: ClientGatewayActionResult): Omit<ClientGatewayActionResult, "commandId"> {
  const { commandId: _commandId, ...rest } = result;
  return rest;
}

/** The types of the messages in `texts`, in order. */
export function typesOf(texts: readonly string[]): string[] {
  return texts.map((text) => (JSON.parse(text) as { type: string }).type);
}
