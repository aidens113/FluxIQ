// Barrel for the private provisioning listener (hosted production plan,
// Account Provisioning API, Transports): the listener and its environment
// entry, its configuration error and types, and the platform services the web
// server composes for it and the account pages.
//
// `platform-services.ts` imports `lib/fluxiq`, so `lib/fluxiq` reaches this
// barrel with a dynamic `import()`, which keeps the two out of a load cycle.
export * from "./platform-services";
export * from "./provisioning-listener-config-error";
export * from "./resolve-email-sender";
export * from "./start-provisioning-listener";
export * from "./listener-for-profile";
export * from "./start-provisioning-listener-from-env";
export type * from "./types";
