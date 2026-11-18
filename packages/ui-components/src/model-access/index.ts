// The shared AI-key card: the six states of a person's AI key with their words, the port a client supplies to
// read and change keys, and the card both clients mount. `model-access.css` styles it (tokens only).
export { createModelKeyCard, defaultModelKeyProviders, type ModelKeyCard, type ModelKeyCardOptions, type ModelKeyHostAction, type ModelKeyProvider, type ModelKeySave, type ModelKeysPort, type ModelKeysResult } from "./key/index.ts";
export { MODEL_ACCESS_CHECKING, modelAccessWords, type ModelAccessActionId, type ModelAccessTone, type ModelAccessWords } from "./words.ts";
export { modelAccessFromCore, type CoreModelAccess } from "./contract/index.ts";
export type { ModelAccessState } from "./state.ts";
