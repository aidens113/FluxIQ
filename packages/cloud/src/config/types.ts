/** Which deployment a config describes. Only values differ between them; the files are the same. */
export type CloudProfile = "local" | "production";

/**
 * Where the platform runs. `local-docker` runs Docker Compose on this
 * machine, whether that is a laptop or the real server; the others are
 * remote drivers, named so a config can select them, and not built yet.
 */
export type CloudDriverName = "local-docker" | "vm" | "aws" | "gcp" | "azure";

/** How Caddy gets its certificate: its own local authority, or ACME (Let's Encrypt). */
export type CloudTlsMode = "internal" | "acme";

/** The config file as written, after schema validation (relative paths not yet resolved). */
export type CloudConfigFile = {
  $schema?: string;
  project: string;
  profile: CloudProfile;
  driver: CloudDriverName;
  source: { root: string };
  stateDir?: string;
  domain: string;
  ports?: { http?: number; https?: number };
  tls: { mode: CloudTlsMode; email: string; trustLocalCa?: boolean };
  instance: { id: string; name?: string };
  signUpUrl?: string;
  gateway: { allowedOrigins: string[] };
  provisioning?: { subnet?: string; address?: string };
  email: { from: string; smtp: string; username?: string; passwordFile?: string };
  payments: { apiBase: string; secretKeyFile?: string };
  sinks?: { mail?: boolean; payments?: boolean; mailUiPort?: number };
  secrets?: { dir?: string };
  images?: { core?: string; caddy?: string; mailpit?: string; stripeMock?: string };
};

/** A validated config with every default applied and every path absolute (forward slashes). */
export type CloudConfig = {
  configFile: string;
  project: string;
  profile: CloudProfile;
  driver: CloudDriverName;
  sourceRoot: string;
  stateDir: string;
  domain: string;
  ports: { http: number; https: number };
  tls: { mode: CloudTlsMode; email: string; trustLocalCa: boolean };
  instance: { id: string; name: string | null };
  signUpUrl: string | null;
  gateway: { allowedOrigins: string[] };
  provisioning: { subnet: string; address: string };
  email: { from: string; smtp: string; username: string | null; passwordFile: string | null };
  payments: { apiBase: string; secretKeyFile: string | null };
  sinks: { mail: boolean; payments: boolean; mailUiPort: number };
  secretsDir: string;
  images: { core: string; caddy: string; mailpit: string; stripeMock: string };
};

/** One problem with a config: where it is (`email.smtp`) and what is wrong. */
export type CloudConfigIssue = {
  path: string;
  message: string;
};
