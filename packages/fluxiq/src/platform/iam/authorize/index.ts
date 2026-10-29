// Barrel for the IAM authorizer (hosted production plan, Permissions,
// "Evaluation"): gather a principal's policies, compile once, evaluate, and
// record one audit row per decision. Inert until B3 wires it into the registry.
export * from "./authorize-options.ts";
export * from "./authorizer.ts";
export * from "./policy-source.ts";
export * from "./request-authorizer.ts";
export * from "./role-session.ts";
