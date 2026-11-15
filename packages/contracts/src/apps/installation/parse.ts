import { parseAppContract } from "../validation/index.ts";
import { appInstallationSchema } from "./schema.ts";

export function parseAppInstallation(value: unknown) {
  return parseAppContract(appInstallationSchema, value, "app.invalid_installation", true);
}
