/** The lifecycle boundaries a handler fires at (C3), as a `handler` recovery names them. */
export const CLIENT_GATEWAY_ACTIVITY_RECOVERY_EVENTS = Object.freeze(["start", "before", "retry", "fail", "before_next"] as const);
export type ClientGatewayActivityRecoveryEvent = (typeof CLIENT_GATEWAY_ACTIVITY_RECOVERY_EVENTS)[number];
