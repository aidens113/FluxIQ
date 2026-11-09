import { fluxIQHostModuleRegistration, importFluxIQHostModule, type FluxIQHostModuleRegistration } from "./import-registration.ts";

/** Imports a host module and returns its registration; a module that exports none throws. */
export async function loadFluxIQHostRegistration(modulePath: string): Promise<FluxIQHostModuleRegistration> {
  const register = fluxIQHostModuleRegistration(await importFluxIQHostModule(modulePath));
  if (!register) {
    throw new Error(`FLUXIQ_HOST_MODULE must export registerFluxIQHost() or a default registration function: ${modulePath}`);
  }
  return register;
}
