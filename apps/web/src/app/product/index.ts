// Barrel for the panel's product branding. This root exports the server side
// only; client components import `./product/client`, which never reaches the
// host module loader.
export * from "./server/index.ts";
