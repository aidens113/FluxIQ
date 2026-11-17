export type ClientGatewayEnvelope<TType extends string = string, TPayload = unknown> = {
  id: string;
  type: TType;
  protocolVersion: string;
  timestamp: number;
  sessionId?: string;
  clientId?: string;
  correlationId?: string;
  payload: TPayload;
};
