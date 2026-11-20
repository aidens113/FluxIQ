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

/**
 * What a deployment is: `service` is the hosted multi-user service (billing,
 * the provisioning listener, sign-up); `self-hosted` is one company's own
 * server with the full base product and no billing or provisioning.
 */
export type CloudMode = "service" | "self-hosted";

/** Whether new people may create their own account on a service: off, or open. */
export type CloudSignup = "off" | "open";

/**
 * What one price of a plan counts: a dedicated browser, a seat, or nothing
 * (a flat price). Stripe's item quantity is the count; FluxIQ alone sets the
 * prices, here, and never in code.
 */
export type CloudBillingUnit = "dedicated-browser" | "seat" | "flat";

/** One grant a plan gives: the entitlement key, its allocation class, what it allows and where. */
export type CloudBillingGrant = {
  key: string;
  allocation: "control" | "shared" | "dedicated";
  capabilities: string[];
  regions: string[];
};

/**
 * A plan the operator sells: its name on the plans page (null: its id), the
 * provider price it is sold as, what that price counts, how many the
 * checkout sells, and what it grants.
 */
export type CloudBillingPlan = { name: string | null; priceId: string; unit: CloudBillingUnit; quantity: number; grants: CloudBillingGrant[] };

/** The billing policy Core's commerce configuration carries (rendered as commerce.json); every value is the operator's. */
export type CloudBilling = {
  provider: "stripe" | "fake";
  allowTrial: boolean;
  graceMs: number;
  retentionMs: number;
  refreshAfterMs: number;
  /** How old a verification admission still trusts; null leaves Core's default. */
  maxVerificationAgeMs: number | null;
  /** How long a started checkout stays payable; null leaves Core's default (one hour). */
  checkoutLifetimeMs: number | null;
  /** Where dedicated browsers run; null leaves Core's default (the one region dedicated grants name). */
  region: string | null;
  plans: Record<string, CloudBillingPlan>;
};

/** The billing section as written: a grant's regions may be left out (control grants have none). */
export type CloudBillingFile = Omit<CloudBilling, "maxVerificationAgeMs" | "checkoutLifetimeMs" | "region" | "plans"> & {
  maxVerificationAgeMs?: number;
  checkoutLifetimeMs?: number;
  region?: string;
  plans: Record<string, { name?: string; priceId: string; unit?: CloudBillingUnit; quantity?: number; grants: (Omit<CloudBillingGrant, "regions"> & { regions?: string[] })[] }>;
};

/** The config file as written, after schema validation (relative paths not yet resolved). */
export type CloudConfigFile = {
  $schema?: string;
  project: string;
  profile: CloudProfile;
  /** Default service. */
  mode?: CloudMode;
  driver: CloudDriverName;
  source: { root: string };
  stateDir?: string;
  domain: string;
  ports?: { http?: number; https?: number };
  tls: { mode: CloudTlsMode; email: string; trustLocalCa?: boolean };
  instance: { id: string; name?: string };
  signUpUrl?: string;
  /** Service only; default off. */
  signup?: CloudSignup;
  gateway: { allowedOrigins: string[] };
  provisioning?: { subnet?: string; address?: string };
  email: { from: string; smtp: string; username?: string; passwordFile?: string };
  /** Required on a service, absent on a self-hosted server. */
  payments?: { apiBase: string; secretKeyFile?: string; webhookSecretFile?: string };
  billing?: CloudBillingFile;
  sinks?: { mail?: boolean; payments?: boolean; mailUiPort?: number };
  secrets?: { dir?: string };
  /** Dedicated browsers on a local rehearsal: a service on the local profile with a dedicated grant. */
  environments?: { runner: { context: string; dockerfile?: string; domain?: string }; limits?: { memory?: string; cpus?: string; pids?: number } };
  images?: { core?: string; runner?: string; caddy?: string; mailpit?: string; stripeMock?: string };
};

/** Dedicated browsers, resolved: the runner image's build context and Dockerfile, and each runner's limits. */
export type CloudEnvironments = {
  runnerContext: string;
  runnerDockerfile: string;
  /** The domain the runner's client declares at the gateway. */
  clientDomain: string;
  limits: { memory: string; cpus: string; pids: number };
};

/** A validated config with every default applied and every path absolute (forward slashes). */
export type CloudConfig = {
  configFile: string;
  project: string;
  profile: CloudProfile;
  mode: CloudMode;
  driver: CloudDriverName;
  sourceRoot: string;
  stateDir: string;
  domain: string;
  ports: { http: number; https: number };
  tls: { mode: CloudTlsMode; email: string; trustLocalCa: boolean };
  instance: { id: string; name: string | null };
  signUpUrl: string | null;
  signup: CloudSignup;
  gateway: { allowedOrigins: string[] };
  provisioning: { subnet: string; address: string };
  email: { from: string; smtp: string; username: string | null; passwordFile: string | null };
  /** Null on a self-hosted server, which has no payments API. */
  payments: { apiBase: string; secretKeyFile: string | null; webhookSecretFile: string | null } | null;
  /** Null when the deployment bills nothing: no commerce configuration is rendered. */
  billing: CloudBilling | null;
  sinks: { mail: boolean; payments: boolean; mailUiPort: number };
  secretsDir: string;
  /** Null when the deployment runs no dedicated browsers. */
  environments: CloudEnvironments | null;
  images: { core: string; runner: string; caddy: string; mailpit: string; stripeMock: string };
};

/** One problem with a config: where it is (`email.smtp`) and what is wrong. */
export type CloudConfigIssue = {
  path: string;
  message: string;
};
