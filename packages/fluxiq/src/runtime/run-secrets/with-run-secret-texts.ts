import type { FluxIQRuntimeWithheldValues } from "../contracts.ts";
import { automationStudioRunSecrets } from "./read.ts";

/**
 * The values a dispatch withholds from the command attempt the runtime saves, with the current run's
 * secrets among its texts, so a command a build's exploration or test sends with a secret in it is
 * saved withheld as a Flow run's already is. Outside a run with secrets, `values` as given.
 */
export function automationStudioWithRunSecretTexts(values: FluxIQRuntimeWithheldValues | undefined): FluxIQRuntimeWithheldValues | undefined {
  const secrets = automationStudioRunSecrets();
  if (!secrets) return values;
  return { texts: [...(values?.texts ?? []), ...Object.values(secrets)], numbers: [...(values?.numbers ?? [])] };
}
