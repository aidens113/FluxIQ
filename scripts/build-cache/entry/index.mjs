// The two command-line entry points as functions of a repository, so Core's
// `cli.mjs` and `prove-inputs.mjs` and a downstream repository's are each a
// line that names the repository.

export { proveInputs } from "./prove-inputs.mjs";
export { runCli } from "./run-cli.mjs";
