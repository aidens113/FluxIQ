// The repository the engine works for. The engine is Core's, and so is its
// default repository; a downstream repository imports the engine and hands it
// its own (`build-cache-for.mjs`): a root, a step registry, a resolver that
// turns a registry entry into input roots and outputs, and its namespace in
// the shared store.

export { CORE_REPOSITORY } from "./core-repository.mjs";
export { resolveFor } from "./resolve-for.mjs";
