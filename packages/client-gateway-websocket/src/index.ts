export * from "./automation-studio.ts";
export * from "./messages.ts";
export * from "./transport.ts";
export * from "./types.ts";

export {
  CLIENT_GATEWAY_PROTOCOL_VERSION,
  type ClientGatewayActionCommand,
  type ClientGatewayActionResult,
  type ClientGatewayAppendRecordingEntryRequest,
  type ClientGatewayCapability,
  type ClientGatewayClientHello,
  type ClientGatewayClientMessage,
  type ClientGatewayClientType,
  type ClientGatewayEnvelope,
  type ClientGatewayPairingChallenge,
  type ClientGatewayRecordingEvent,
  type ClientGatewayServerMessage,
  type ClientGatewaySession,
  type ClientGatewaySnapshot,
  type ClientGatewayStartRecordingRequest,
  type ClientGatewayStateUpdate,
  type ClientGatewayStopRecordingRequest
} from "@fluxiq/contracts/client-gateway";

export type {
  AppendRecordingDomainEventRequest,
  AppendRecordingEntryRequest,
  CreateRecordingRequest,
  CreateRecordingSessionInput,
  FinalizeRecordingRequest,
  RecordingDomainDefinition,
  RecordingDomainEventInput,
  RecordingSession,
  StateSnapshot
} from "@fluxiq/contracts/automation-studio";
