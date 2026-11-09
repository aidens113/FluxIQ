// Barrel for the `fluxiq` command: its arguments, `fluxiq dev`, and opening the
// instance it serves. `main.ts` is the `bin` that runs it; this entry is not
// part of `fluxiq/server`, so that importing the server never opens an instance.
export * from "./dev-arguments.ts";
export * from "./open-host-instance.ts";
export * from "./run-command.ts";
export * from "./run-dev.ts";
