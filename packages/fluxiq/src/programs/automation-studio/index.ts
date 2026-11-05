// Automation Studio's own entry, `fluxiq/automation-studio`: a controller of the
// framework, holding its endpoints, view state and metadata. The automation runtime
// itself is `fluxiq/automation`.
export * from "./api/handlers.ts";
export { automationStudioPersonProject, automationStudioProjectName } from "./api/index.ts";
export * from "./metadata.ts";
export * from "./ui/index.ts";
