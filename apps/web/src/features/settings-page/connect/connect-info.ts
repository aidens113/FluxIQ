import { asRecord, textOf } from "../../home/model";

/** What a client needs to find this panel; any part may be unknown until the discovery document and the gateway answer. */
export type ConnectInfo = { panelAddress: string; gatewayUrl: string | undefined; discoveryText: string | undefined };

/** Reads the discovery document and the gateway public address into the three values a person copies. The fallback origin is the address the page was opened from. */
export function connectInfo(discovery: unknown, gatewayPublicUrl: unknown, fallbackOrigin: string): ConnectInfo {
  const record = asRecord(discovery);
  return {
    panelAddress: textOf(record?.origin) ?? fallbackOrigin,
    gatewayUrl: textOf(record?.gatewayUrl) ?? textOf(gatewayPublicUrl),
    discoveryText: record ? JSON.stringify(record, null, 2) : undefined
  };
}
