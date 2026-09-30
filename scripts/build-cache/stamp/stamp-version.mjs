// The stamp format and fingerprint scheme, as one number. Raise it whenever
// what a fingerprint covers or how it is computed changes, so every stamp
// written under the old scheme stops matching instead of vouching for inputs
// it never hashed. The build-cache sources are also hashed into every
// fingerprint (`resolve-step.mjs`), so an edit here invalidates stamps even
// when this number is forgotten; the number is what makes the intent explicit.

export const STAMP_VERSION = 1;
