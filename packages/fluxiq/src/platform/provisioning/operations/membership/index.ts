// Barrel for the membership operations: one membership in one shared
// workspace is suspended, resumed or removed, with the shared rules they run
// by (the workspace kind, its last administrator, ending its access).
export * from "./end-workspace-access.ts";
export * from "./refuse-last-workspace-administrator.ts";
export * from "./remove-member.ts";
export * from "./require-shared-workspace.ts";
export * from "./resume-member.ts";
export * from "./suspend-member.ts";
