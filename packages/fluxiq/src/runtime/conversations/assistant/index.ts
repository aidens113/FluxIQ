// The panel-wide assistant (FluxNode plan U5, U7): `panel` threads stored per
// person outside every project, and a tool loop over the program API that does
// what the person can, asks before consequential acts their words did not
// clearly ask for, and is bounded by their spending allowance and Core's loop
// detection.
//
// Not re-exported from `../index.ts`: the conversations barrel reaches browser
// bundles, and this module opens databases and model providers.
export type * from "./types.ts";
export * from "./allowance.ts";
export * from "./store/index.ts";
export * from "./context/index.ts";
export * from "./consent/index.ts";
export * from "./model/index.ts";
export * from "./loop/index.ts";
export * from "./attachments/index.ts";
export * from "./thread-use.ts";
export * from "./panel-assistant.ts";
