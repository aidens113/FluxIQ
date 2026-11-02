import type { EnvironmentDescriptor, SourceDescriptor, ActionChannelDescriptor } from "@fluxiq/contracts/recording";
import type { ClientGatewaySession } from "../../contracts.ts";
import { compactJsonObject } from "./metadata.ts";
export function clientRecordingDefaults(session: ClientGatewaySession, domainId: string | null, host: boolean): { environment: EnvironmentDescriptor; sources: SourceDescriptor[]; actionChannels: ActionChannelDescriptor[] } {
  return {
    environment: { id: `client.${session.clientId}`, label: session.name, kind: session.clientType, domainId, capabilities: session.capabilities.map(capability => capability.id), metadata: compactJsonObject({ sessionId: session.sessionId, ...(session.version ? { version: session.version } : {}), ...(session.metadata ?? {}) }) },
    sources: [{ id: `client.${session.clientId}.events`, label: `${session.name} events`, kind: "event", metadata: { sessionId: session.sessionId, clientType: session.clientType } }, { id: `client.${session.clientId}.observations`, label: `${session.name} observations`, kind: "observation", metadata: { sessionId: session.sessionId, clientType: session.clientType } }],
    actionChannels: host ? [{ id: `client.${session.clientId}.actions`, label: `${session.name} action channel`, actionTypes: session.capabilities.flatMap(capability => capability.actionTypes ?? []), capabilities: session.capabilities.map(capability => capability.id), metadata: { sessionId: session.sessionId, clientType: session.clientType } }] : []
  };
}
