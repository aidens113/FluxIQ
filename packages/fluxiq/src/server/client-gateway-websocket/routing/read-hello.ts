import { CLIENT_GATEWAY_PROTOCOL_VERSION, type ClientGatewayClientHello } from "../../../client-gateway/index.ts";

const CLIENT_TYPES = new Set(["extension", "desktop-recorder", "cli", "worker", "custom"]);
const CAPABILITY_KINDS = new Set(["recording", "snapshot", "action", "state", "runtime", "custom"]);

/** Only a well-formed, protocol-compatible first hello can enter the authority resolver. */
export function readRoutedClientHello(text: string): ClientGatewayClientHello | null {
  let envelope: unknown;
  try {
    envelope = JSON.parse(text);
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
  if (!object(envelope) || envelope.type !== "client.hello" || typeof envelope.id !== "string" || !envelope.id) return null;
  if (typeof envelope.timestamp !== "number" || !Number.isFinite(envelope.timestamp)) return null;
  if (typeof envelope.protocolVersion !== "string" || !/^\d+\.\d+(?:\.\d+)?$/.test(envelope.protocolVersion)) return null;
  if (Number(envelope.protocolVersion.split(".")[0]) !== Number(CLIENT_GATEWAY_PROTOCOL_VERSION.split(".")[0])) return null;
  for (const key of ["sessionId", "clientId", "correlationId"]) {
    if (envelope[key] !== undefined && typeof envelope[key] !== "string") return null;
  }
  const hello = envelope.payload;
  if (!object(hello) || typeof hello.clientType !== "string" || !CLIENT_TYPES.has(hello.clientType)) return null;
  for (const key of ["clientId", "name", "version", "token", "enrolmentTicket"]) {
    if (hello[key] !== undefined && typeof hello[key] !== "string") return null;
  }
  if (hello.metadata !== undefined && (!object(hello.metadata) || (hello.metadata.clientLabel !== undefined && typeof hello.metadata.clientLabel !== "string"))) return null;
  if (hello.capabilities !== undefined && (!Array.isArray(hello.capabilities) || !hello.capabilities.every(capability))) return null;
  return hello as ClientGatewayClientHello;
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function capability(value: unknown): boolean {
  if (!object(value) || typeof value.id !== "string" || typeof value.kind !== "string" || !CAPABILITY_KINDS.has(value.kind)) return false;
  if (value.label !== undefined && typeof value.label !== "string") return false;
  if (value.actionTypes !== undefined && (!Array.isArray(value.actionTypes) || !value.actionTypes.every((entry) => typeof entry === "string"))) return false;
  return value.metadata === undefined || object(value.metadata);
}
