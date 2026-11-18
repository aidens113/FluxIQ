import type { CloudDriverName, CloudProfile } from "../config/index.ts";

/**
 * What a deployment created, recorded in `<state>/state.json` as `up` goes,
 * so `down` removes exactly that and nothing else, even after a failed `up`.
 * Containers, networks, volumes and the built image are also found by their
 * project label; this file adds what a label cannot mark (generated secret
 * files, images pulled because they were absent, the exported and trusted
 * certificate).
 */
export type CloudState = {
  version: 1;
  project: string;
  profile: CloudProfile;
  driver: CloudDriverName;
  /** `absent` is a state synthesised when no file exists: nothing recorded, labels still swept. */
  phase: "absent" | "starting" | "up" | "stopped";
  stateFile: string;
  bundleDir: string;
  composeFiles: string[];
  composeEnvFile: string;
  coreImage: string;
  publicOrigin: string;
  mailUi: string | null;
  generatedSecrets: string[];
  pulledImages: string[];
  networks: string[];
  exportedCa: string | null;
  trustedCa: { thumbprint: string } | null;
};
