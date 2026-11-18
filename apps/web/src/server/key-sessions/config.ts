import { resolveFluxIQDeploymentSettings } from "fluxiq/platform/profile";
import { INSTANCE_ID_PATTERN, resolveInstanceId } from "./instance-id";

/** Stable operator identity, shared with discovery; never inferred from request headers. */
export function keySessionConfig(env: Readonly<Record<string, string | undefined>> = process.env): { origin: string; instanceId: string } {
  const settings = resolveFluxIQDeploymentSettings(env);
  const instanceId = resolveInstanceId(env, settings);
  if (!instanceId || !INSTANCE_ID_PATTERN.test(instanceId)) {
    throw new Error("key.configuration: FLUXIQ_INSTANCE_ID must be a stable instance identifier.");
  }
  return { origin: new URL(settings.publicOrigin).origin, instanceId };
}
