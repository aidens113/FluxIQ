// Barrel for the FRNs the IAM engine builds: a workspace (what a top-level
// create or list acts on), a principal, and an operator program. Each formats
// through `formatFluxIQResourceName`, so it always parses back.
export * from "./principal-frn.ts";
export * from "./program-frn.ts";
export * from "./workspace-frn.ts";
