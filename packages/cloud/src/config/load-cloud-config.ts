import { readFile } from "node:fs/promises";
import { CloudConfigError } from "./cloud-config-error.ts";
import { parseCloudConfig } from "./parse-cloud-config.ts";
import type { CloudConfig } from "./types.ts";

/** Reads and validates a config file; a missing or unreadable file is a `CloudConfigError` too. */
export async function loadCloudConfig(configFile: string): Promise<CloudConfig> {
  let text: string;
  try { text = await readFile(configFile, "utf8"); }
  catch { throw new CloudConfigError(configFile, [{ path: "(the file)", message: "could not be read; pass --config <file> or run where fluxiq-cloud.config.json is" }]); }
  return parseCloudConfig(text, configFile);
}
