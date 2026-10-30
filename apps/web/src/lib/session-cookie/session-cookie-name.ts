import { resolveFluxIQDeploymentSettings } from "fluxiq/platform/profile";

/**
 * The panel session cookie's name, fixed at module load from the deployment
 * settings: `__Host-fluxiq_session` on an https public origin, else `fluxiq_session`.
 */
export const FLUXIQ_SESSION_COOKIE: string = resolveFluxIQDeploymentSettings(process.env).session.name;
