import path from "node:path";
import { checkAgainstSchema, type SchemaNode } from "./check-against-schema.ts";
import { checkProfileRules } from "./check-profile-rules.ts";
import { CLOUD_CONFIG_SCHEMA } from "./cloud-config-schema.ts";
import { CloudConfigError } from "./cloud-config-error.ts";
import { resolveConfigPath } from "./resolve-config-path.ts";
import type { CloudConfig, CloudConfigFile } from "./types.ts";

/** The images used when a config names none. Pinned, so a rebuild is the same stack. */
const DEFAULT_IMAGES = { core: "fluxiq-cloud/core", caddy: "caddy:2.10-alpine", mailpit: "axllent/mailpit:v1.33.1", stripeMock: "stripe/stripe-mock:v0.205.0" };

/**
 * Validates a config file's text (schema, then the profile rules) and answers
 * it with every default applied and every path absolute. Every problem is
 * reported at once, in a `CloudConfigError`.
 */
export function parseCloudConfig(text: string, configFile: string): CloudConfig {
  const file = configFile.replace(/\\/gu, "/");
  let raw: unknown;
  try { raw = JSON.parse(text); }
  catch (error) { throw new CloudConfigError(file, [{ path: "(the file)", message: `is not valid JSON (${(error as Error).message})` }]); }
  const schemaIssues = checkAgainstSchema(raw, CLOUD_CONFIG_SCHEMA as unknown as SchemaNode);
  if (schemaIssues.length > 0) throw new CloudConfigError(file, schemaIssues);
  const value = raw as CloudConfigFile;
  const ruleIssues = checkProfileRules(value);
  if (ruleIssues.length > 0) throw new CloudConfigError(file, ruleIssues);

  const configDir = path.dirname(path.resolve(configFile));
  const at = (relative: string) => resolveConfigPath(relative, configDir);
  const stateDir = `${at(value.stateDir ?? ".fluxiq/cloud")}/${value.project}`;
  return {
    configFile: file,
    project: value.project,
    profile: value.profile,
    driver: value.driver,
    sourceRoot: at(value.source.root),
    stateDir,
    domain: value.domain,
    ports: { http: value.ports?.http ?? 80, https: value.ports?.https ?? 443 },
    tls: { mode: value.tls.mode, email: value.tls.email, trustLocalCa: value.tls.trustLocalCa ?? false },
    instance: { id: value.instance.id, name: value.instance.name ?? null },
    signUpUrl: value.signUpUrl ?? null,
    gateway: { allowedOrigins: [...value.gateway.allowedOrigins] },
    provisioning: { subnet: value.provisioning?.subnet ?? "172.31.250.0/24", address: value.provisioning?.address ?? "172.31.250.10" },
    email: { from: value.email.from, smtp: value.email.smtp, username: value.email.username ?? null, passwordFile: value.email.passwordFile === undefined ? null : at(value.email.passwordFile) },
    payments: { apiBase: value.payments.apiBase, secretKeyFile: value.payments.secretKeyFile === undefined ? null : at(value.payments.secretKeyFile) },
    sinks: { mail: value.sinks?.mail ?? false, payments: value.sinks?.payments ?? false, mailUiPort: value.sinks?.mailUiPort ?? 8025 },
    secretsDir: value.secrets?.dir === undefined ? `${stateDir}/secrets` : at(value.secrets.dir),
    images: { ...DEFAULT_IMAGES, ...value.images }
  };
}
