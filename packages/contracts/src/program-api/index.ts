// Barrel for program API endpoint inputs (parser plus JSON Schema) and the
// panel assistant's tool vocabulary. Inputs live in one directory per program
// id, one file per resource noun. Published as `@fluxiq/contracts/program-api-inputs`.
export * from "./assistant/index.ts";
export * from "./automation-studio/index.ts";
export * from "./background-tasks/index.ts";
export * from "./compute-control/index.ts";
export * from "./database-manager/index.ts";
export * from "./deployment-sync/index.ts";
export * from "./docs/index.ts";
export * from "./identity-access/index.ts";
export * from "./input/index.ts";
export * from "./production-runner/index.ts";
export * from "./runtime/index.ts";
export * from "./secret-keys/index.ts";
