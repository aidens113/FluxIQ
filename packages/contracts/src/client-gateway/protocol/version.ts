/**
 * The version the gateway stamps on its envelopes. Gateway 0.2 (hosted
 * production plan) is additive over 0.1 and shares its major version; the
 * versions this contract describes are `CLIENT_GATEWAY_PROTOCOL_VERSIONS`. This
 * stays `0.1` until the gateway sends the 0.2 messages, since it is also a
 * recorded trace's contract version.
 */
export const CLIENT_GATEWAY_PROTOCOL_VERSION = "0.1";
