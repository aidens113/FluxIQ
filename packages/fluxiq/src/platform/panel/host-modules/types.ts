import type { FluxIQ } from "../../../framework/index.ts";

export type HostInstanceRegistration = (fluxiq: FluxIQ) => FluxIQ | void;

export type LoadedPlatformHostModules = { paths: string[]; instanceRegistrations: HostInstanceRegistration[] };
