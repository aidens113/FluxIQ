import type { FluxIQDeploymentSettings } from "fluxiq/platform";
import { readConfiguredSetupCode } from "./configured-setup-code";
import { readGeneratedSetupCode } from "./generated-setup-code";

/**
 * The code `/setup` accepts: the trimmed content of `FLUXIQ_SETUP_CODE_FILE`
 * when it is set (which throws when unreadable or under 16 characters, so the
 * submit fails closed), otherwise the generated `<fluxiq>/security/setup-code`,
 * null when there is none, so no code can match. Never logs.
 */
export async function readSetupCode(settings: FluxIQDeploymentSettings, fluxiqDir: string): Promise<string | null> {
  if (settings.setupCodeFile !== null) return readConfiguredSetupCode(settings.setupCodeFile);
  return readGeneratedSetupCode(fluxiqDir);
}
