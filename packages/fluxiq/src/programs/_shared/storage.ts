// Compatibility aliases; the framework owns the actual shared storage implementation.
export type { JsonFileDocument } from "../../framework/persistence/index.ts";
export { ProgramJsonStore, ProgramDocumentTransaction, ProgramStateReadError, programStateConnections, programDataFile, normalizeScope, scopeKey, safeSegment, isJsonObject, cloneJson } from "../../framework/persistence/index.ts";
