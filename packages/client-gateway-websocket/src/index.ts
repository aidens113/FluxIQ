export * from "./automation-studio";
export * from "./messages";
export * from "./transport";
export * from "./types";

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
} from "fluxiq/client-gateway";

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
} from "fluxiq/automation-studio";
