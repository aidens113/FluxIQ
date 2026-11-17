import { resolveFluxIQDeploymentSettings } from "fluxiq/platform/profile";

/** Stable operator identity, shared with discovery; never inferred from request headers. */
export function keySessionConfig(env: Readonly<Record<string, string | undefined>> = process.env): { origin: string; instanceId: string } {
  const settings = resolveFluxIQDeploymentSettings(env);
  const instanceId = env.FLUXIQ_INSTANCE_ID?.trim();
  if (!instanceId || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(instanceId)) {
    throw new Error("key.configuration: FLUXIQ_INSTANCE_ID must be a stable instance identifier.");
  }
  return { origin: new URL(settings.publicOrigin).origin, instanceId };
}
