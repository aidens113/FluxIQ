// What a model id may look like: 1 to 128 of letters, digits, ".", "_", ":", "/" and "-",
// starting with a letter or digit. Shared by the spec's options and by overrides.

export const FLUXNODE_MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;
