/** How a recovery ended: it moved the run on, it failed, or a guard or budget refused it before it ran. */
export const CLIENT_GATEWAY_ACTIVITY_RECOVERY_OUTCOMES = Object.freeze(["succeeded", "failed", "refused"] as const);
export type ClientGatewayActivityRecoveryOutcome = (typeof CLIENT_GATEWAY_ACTIVITY_RECOVERY_OUTCOMES)[number];
