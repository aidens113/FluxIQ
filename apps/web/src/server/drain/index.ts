// Barrel for graceful shutdown: the draining flag, the program calls refused
// while draining, and the wait for open gateway connections. They live in Core
// (`fluxiq/server`) beside the program route and the transport they serve.
export { drainGateway, drainState, programDrainRefusal } from "fluxiq/server";
export type { DrainableGateway, DrainOptions, ProgramDrainRefusal } from "fluxiq/server";
