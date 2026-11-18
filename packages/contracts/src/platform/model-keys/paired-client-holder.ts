/**
 * What a paired client's holder is known by inside Core: its stored id, and the random
 * handle it is held under. Never something a standing authorization may name, because
 * a browser's own handle pays only for what that browser itself asks for. The value is
 * persisted in holder records, so it does not change.
 */
export const PAIRED_CLIENT_HOLDER_PREFIX = "paired-client:";
