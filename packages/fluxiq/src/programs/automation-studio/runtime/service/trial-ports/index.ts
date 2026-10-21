// Barrel for a build's trial ports (trace plan P5): the service's
// collaborators a trial runs with and where each service hands them over, the
// registry a build writes against, the trial environment, the whole
// candidate's trial ports, and the seam a host makes those ports through
// outside a build. `runtime/index.ts` publishes only the seam.
export type * from "./collaborators.ts";
export * from "./collaborator-registry.ts";
export * from "./registry-resolution.ts";
export * from "./environment.ts";
export * from "./whole-ports.ts";
export * from "./service-ports.ts";
