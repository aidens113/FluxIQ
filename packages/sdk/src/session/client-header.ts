// The header every SDK call carries. An engine in open mode takes unkeyed calls only
// when they are JSON and say which client sent them (keys design, section 4).

export const CLIENT_HEADER = "FluxIQ-Client";

export const CLIENT_HEADER_VALUE = "sdk";
