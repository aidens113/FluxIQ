// Test support for the trace matcher: a live episode recorded through the real
// gateway tap, with a scripted client paired before the trace began, and the
// client messages it sends, written by field name.

import { createHash } from "node:crypto";
import {
  CLIENT_GATEWAY_PROTOCOL_VERSION,
  ClientGatewayService,
  type ClientGatewayActionCommand,
  type ClientGatewayActionResult,
  type ClientGatewayCapability,
  type ClientGatewayClientMessage
} from "../../index.ts";
import { openTrace, traceScope, type OpenTrace } from "../../tests/trace-tap-support.ts";

export const ACTIONS: ClientGatewayCapability = { id: "example.actions", kind: "action" };
export const ANSWERS_RECONCILE: ClientGatewayCapability = { id: "example.reconcile", kind: "action", metadata: { answersReconcile: true } };

/** What a scripted client can do when it answers. */
export type ScriptedClient = {
  say(text: string): void;
  upload(bytes: Uint8Array, mediaType: string): string;
};

/** One answer step: after `delayMs`, `act` runs with the command's id. */
export type ScriptStep = { delayMs: number; act: (client: ScriptedClient, commandId: string) => void };

/** The steps a command is answered with; `occurrence` counts commands of the same action type from 1. */
export type Script = (command: { actionType: string; parameters?: unknown }, occurrence: number) => readonly ScriptStep[];

export type LiveEpisode = {
  execute(command: ClientGatewayActionCommand): Promise<ClientGatewayActionResult>;
  /** An unsolicited message from the client. */
  say(text: string): Promise<void>;
};

export type Recorded = { trace: OpenTrace; results: ClientGatewayActionResult[] };

export function message<TType extends ClientGatewayClientMessage["type"]>(type: TType, payload: Extract<ClientGatewayClientMessage, { type: TType }>["payload"], id = `${type}.${Math.random().toString(36).slice(2)}`): string {
  return JSON.stringify({ id, type, protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: 1_700_000_000_000, payload });
}

export function succeeded(commandId: string, payload: Record<string, string | number | boolean | number[]>): string {
  return message("client.action_result", { commandId, status: "succeeded", payload });
}

export function stateUpdate(state: Record<string, string>, metadata?: Record<string, string>): string {
  return message("client.state_update", metadata === undefined ? { state } : { state, metadata });
}

/** Records one live episode: a scripted client paired before the trace, then `drive` run inside the trace. */
export async function recordEpisode(input: {
  traceId: string;
  script: Script;
  drive: (episode: LiveEpisode) => Promise<void>;
  commandTimeoutMs?: number;
  capabilities?: ClientGatewayCapability[];
  /** How the client answers a reconcile question about a command; unanswered by default. */
  reconcile?: (commandId: string) => readonly ScriptStep[];
}): Promise<Recorded> {
  const scope = traceScope();
  const trace = openTrace(input.traceId);
  const gateway = new ClientGatewayService({ commandTimeoutMs: input.commandTimeoutMs ?? 60_000, reconcileAnswerMs: 5_000, trace: scope.source });
  const errors: unknown[] = [];
  const counts = new Map<string, number>();
  let sessionId = "";
  const client: ScriptedClient = {
    say: (text) => {
      gateway.receiveRaw(sessionId, text).catch((error: unknown) => errors.push(error));
    },
    upload: (bytes, mediaType) => {
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      gateway.receiveTraceArtifact(sessionId, { sha256, mediaType, bytes });
      return sha256;
    }
  };
  const socket = {
    send: (raw: string) => {
      const sent = JSON.parse(raw) as { type: string; payload: { commandId: string; actionType: string; parameters?: unknown } };
      if (sent.type === "server.reconcile_command") {
        for (const step of input.reconcile?.(sent.payload.commandId) ?? []) setTimeout(() => step.act(client, sent.payload.commandId), step.delayMs);
        return;
      }
      if (sent.type !== "server.execute_action") return;
      const occurrence = (counts.get(sent.payload.actionType) ?? 0) + 1;
      counts.set(sent.payload.actionType, occurrence);
      for (const step of input.script(sent.payload, occurrence)) setTimeout(() => step.act(client, sent.payload.commandId), step.delayMs);
    }
  };
  sessionId = gateway.connect({ socket }).sessionId;
  await gateway.receiveRaw(sessionId, message("client.hello", { clientId: "client.matcher", clientType: "extension", name: "client.matcher", version: "1.0.0", capabilities: input.capabilities ?? [ACTIONS], metadata: { domainId: "example.domain" } }));
  const pairing = gateway.snapshot().pairings.find((item) => item.requestedBySessionId === sessionId);
  if (pairing) await gateway.approvePairing(pairing.pairingCode, { approvedByUserId: "user.matcher" });
  const results: ClientGatewayActionResult[] = [];
  await input.drive({
    execute: async (command) => {
      const result = await scope.within(trace.recorder, () => gateway.executeAction(sessionId, command)).result;
      results.push(result);
      return result;
    },
    say: (text) => gateway.receiveRaw(sessionId, text)
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  await trace.recorder.close({ terminationReason: "completed", terminationDetail: null });
  await gateway.close();
  if (errors.length > 0) throw new Error(`the scripted client failed: ${String(errors[0])}`);
  return { trace, results };
}
