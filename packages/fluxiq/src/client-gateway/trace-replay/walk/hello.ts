// A client hello as a replay sends it (traces and offline trials, P3), read
// field by field from a recorded one, or from what the replay knows about a
// session the trace met. A recorded token is never read back: the trace holds
// only the credential marker that stood in for it, so a replayed hello carries
// no token. Capabilities are kept when they are well formed.

import type { ClientGatewayCapability, ClientGatewayClientHello, ClientGatewayClientType } from "@fluxiq/contracts/client-gateway";
import type { JsonObject } from "../../../core/index.ts";

const CLIENT_TYPES: ReadonlySet<string> = new Set(["extension", "desktop-recorder", "cli", "worker", "custom"]);
const CAPABILITY_KINDS: ReadonlySet<string> = new Set(["recording", "snapshot", "action", "state", "runtime", "custom"]);

/** The hello `value` describes, or `undefined` when it names no client type. */
export function readClientGatewayTraceHello(value: unknown): ClientGatewayClientHello | undefined {
  if (!isRecord(value) || !isClientType(value.clientType)) return undefined;
  const hello: ClientGatewayClientHello = { clientType: value.clientType };
  if (typeof value.clientId === "string") hello.clientId = value.clientId;
  if (typeof value.name === "string") hello.name = value.name;
  if (typeof value.version === "string") hello.version = value.version;
  if (Array.isArray(value.capabilities)) hello.capabilities = value.capabilities.filter(isCapability).map((capability) => structuredClone(capability));
  if (isJsonObject(value.metadata)) hello.metadata = structuredClone(value.metadata);
  return hello;
}

function isCapability(value: unknown): value is ClientGatewayCapability {
  return isRecord(value) && typeof value.id === "string" && typeof value.kind === "string" && CAPABILITY_KINDS.has(value.kind);
}

function isClientType(value: unknown): value is ClientGatewayClientType {
  return typeof value === "string" && CLIENT_TYPES.has(value);
}

function isJsonObject(value: unknown): value is JsonObject {
  return isRecord(value);
}

function isRecord(value: unknown): value is { readonly [key: string]: unknown } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
