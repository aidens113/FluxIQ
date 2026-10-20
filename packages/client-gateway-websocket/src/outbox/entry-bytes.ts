import type { ClientGatewayOutboxEntry } from "./types.ts";

const encoder = new TextEncoder();

/**
 * How many bytes an entry takes: the UTF-8 length of its binding and message
 * as JSON, close to what a host storing the state as JSON spends on it. Any
 * size already recorded on the entry is left out of the measure.
 */
export function clientGatewayOutboxEntryBytes(entry: ClientGatewayOutboxEntry): number {
  return encoder.encode(JSON.stringify({ binding: entry.binding, message: entry.message })).length;
}
