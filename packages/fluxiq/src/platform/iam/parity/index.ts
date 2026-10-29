// Barrel for the IAM parity check: today's role permission check against the
// role's predefined policies, per registration and role, so the switch to IAM
// is provably inert for the local and self-hosted profiles.
export * from "./compare-role-parity.ts";
export * from "./parity-report.ts";
export * from "./parity-role.ts";
