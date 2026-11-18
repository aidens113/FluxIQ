import type { CloudConfig } from "../config/index.ts";

/** A secret file the deployment mounts, and whether `up` may generate it when absent. */
export type PlannedSecret = {
  /** The Compose secret's name (`/run/secrets/<name>` in the container). */
  name: string;
  /** The file on the host, absolute. */
  file: string;
  /** What `up` writes when the file is absent; `operator` files are never generated. */
  generate: "token" | "setup-code" | "keyring" | "stripe-mock-key" | "webhook-secret" | "operator";
};

/** A file the plan renders into the secrets volume (Core's /run/secrets), from the config alone: it holds no secret and is rewritten on every `up`. */
export type PlannedRenderedFile = {
  /** The file's name in the volume (`/run/secrets/<name>`). */
  name: string;
  /** The same text, bundle-relative, in the rendered bundle. */
  bundlePath: string;
  content: string;
};

/** One file of the rendered bundle: written from text, or copied from the Core checkout's deploy/. */
export type PlannedFile = { content: string } | { copyFrom: string };

/**
 * Everything `up` will do, decided from the config alone: pure and
 * deterministic, so the same config always plans the same deployment and
 * `render` can write it without deploying.
 */
export type CloudPlan = {
  config: CloudConfig;
  project: string;
  packageVersion: string;
  publicOrigin: string;
  stateFile: string;
  /** Where the bundle is written; Compose runs from its compose/ folder. */
  bundleDir: string;
  /** Bundle-relative, in the order Compose reads them. */
  composeFiles: string[];
  /** Bundle-relative: the values Compose interpolates into the files. */
  composeEnvFile: string;
  /** Bundle-relative path to contents, sorted by path. */
  files: Record<string, PlannedFile>;
  coreImage: string;
  /** Images the deployment pulls (Caddy, the sinks), and the Dockerfile's base image's build argument. */
  pulledImages: string[];
  dockerfile: string;
  services: string[];
  networks: { edge: string; provisioning: string | null; runners: string };
  volumes: string[];
  /** The volume Core reads its secrets from (/run/secrets), filled by the driver from the secret files. */
  secretsVolume: string;
  secrets: PlannedSecret[];
  /** Files rendered into the secrets volume beside the secrets (the commerce configuration). */
  renderedFiles: PlannedRenderedFile[];
  /** Where Caddy's local root certificate is exported for clients to pin (tls internal only). */
  exportedCa: string | null;
  mailUi: string | null;
};
