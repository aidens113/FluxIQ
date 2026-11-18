// The host lease on gateway action commands (automation-project-agents-plan,
// `Host resources and concurrency`): where the gateway reads it, how it is
// stamped or refused, and the failure a refused command answers with.
export { clientGatewayHostLeaseRefusal, type ClientGatewayHostLeaseRefusalCode } from "./refusal.ts";
export { isClientGatewayHostLease } from "./shape.ts";
export type { ClientGatewayHostLeaseSource } from "./source.ts";
export type { ClientGatewayHostLeaseTarget } from "./target.ts";
export type { ClientGatewayHostLeaseTargetSource } from "./target-source.ts";
export { ClientGatewayHostLeaseAdmissionRefusal } from "./admission-refusal.ts";
export { clientGatewayHostLeaseStamp, type ClientGatewayHostLeaseStamp } from "./stamp.ts";
