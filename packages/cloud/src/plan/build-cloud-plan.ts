import type { CloudConfig } from "../config/index.ts";
import { CLOUD_PROJECT_LABEL } from "./project-label.ts";
import { COMMERCE_CONFIG_SECRET, renderCommerceConfig, renderComposeEnv, renderOverride, renderServiceEnv, renderSinks } from "./render/index.ts";
import type { CloudPlan, PlannedFile, PlannedRenderedFile, PlannedSecret } from "./types.ts";

/**
 * Plans a deployment from its config: the bundle of files Compose runs (the
 * Core checkout's deploy/compose/service.compose.yml and Caddyfile, copied
 * unchanged, plus the generated override, sinks file and env files), the
 * images, networks, volumes and secrets. Pure and deterministic: the same
 * config and version always give the same plan, byte for byte.
 * `deployFilesDir` is where the deploy/ files are copied from: the source
 * checkout itself for `up`, which builds from it on this machine; `render`
 * for another machine may read them from the checkout it runs in.
 */
export function buildCloudPlan(config: CloudConfig, packageVersion: string, deployFilesDir = `${config.sourceRoot}/deploy`): CloudPlan {
  const { project } = config;
  const deployDir = `${config.sourceRoot}/deploy`;
  const coreImage = `${config.images.core}:${packageVersion}`;
  const selfHosted = config.mode === "self-hosted";
  // A self-hosted server has no provisioning listener, so no provisioning network.
  const networks = { edge: `${project}_edge`, provisioning: selfHosted ? null : `${project}_provisioning`, runners: `${project}_runners` };
  const publicOrigin = `https://${config.domain}${config.ports.https === 443 ? "" : `:${config.ports.https}`}`;
  const secrets = plannedSecrets(config);
  const smtpSecret = secrets.find((secret) => secret.name === "email_smtp_password")?.name ?? null;
  const baseCompose = `compose/${config.mode}.compose.yml`;
  const envFile = `env/${config.mode}.env`;
  const composeFiles = [baseCompose, "compose/cloud.override.yml"];
  if (config.sinks.mail || config.sinks.payments) composeFiles.push("compose/sinks.compose.yml");
  const services = ["fluxiq", "caddy", ...(config.sinks.mail ? ["mailpit"] : []), ...(config.sinks.payments ? ["stripe-mock"] : [])];
  const pulledImages = [config.images.caddy, ...(config.sinks.mail ? [config.images.mailpit] : []), ...(config.sinks.payments ? [config.images.stripeMock] : [])];

  const commerce = renderCommerceConfig(config);
  const renderedFiles: PlannedRenderedFile[] = commerce === null ? [] : [{ name: COMMERCE_CONFIG_SECRET, bundlePath: "env/commerce.json", content: commerce }];

  const files: Record<string, PlannedFile> = {
    "caddy/Caddyfile": { copyFrom: `${deployFilesDir}/caddy/Caddyfile.example` },
    "compose/cloud.override.yml": { content: renderOverride(config.mode) },
    "compose/compose.env": { content: renderComposeEnv(config, coreImage, networks.provisioning) },
    [baseCompose]: { copyFrom: `${deployFilesDir}/${baseCompose}` },
    [envFile]: { content: renderServiceEnv(config, publicOrigin, smtpSecret, commerce === null ? null : `/run/secrets/${COMMERCE_CONFIG_SECRET}`) }
  };
  for (const file of renderedFiles) files[file.bundlePath] = { content: file.content };
  if (composeFiles.length === 3) files["compose/sinks.compose.yml"] = { content: renderSinks(config.sinks) };
  const upCommand = ["docker", "compose", "--project-name", project, "--env-file", "compose/compose.env", ...composeFiles.flatMap((file) => ["--file", file]), "up", "--detach", "--wait"];
  files["deployment.json"] = {
    content: `${JSON.stringify({
      generatedBy: `@fluxiq/cloud@${packageVersion}`,
      project, profile: config.profile, mode: config.mode, publicOrigin, image: coreImage,
      label: `${CLOUD_PROJECT_LABEL}=${project}`,
      composeFiles, composeEnvFile: "compose/compose.env",
      secretsVolume: `${project}_secrets`,
      secrets: secrets.map((secret) => ({ name: secret.name, file: secret.file })),
      renderedFiles: renderedFiles.map((file) => ({ name: file.name, file: file.bundlePath })),
      run: "Create the secrets volume with the project label and copy each secret file into it as <name>, and each rendered file (from this folder) as its name, all owned by 1000:1000 with mode 0400 (fluxiq-cloud up does both); then, from this folder:",
      upCommand
    }, null, 2)}\n`
  };

  return {
    config, project, packageVersion, publicOrigin,
    stateFile: `${config.stateDir}/state.json`,
    bundleDir: `${config.stateDir}/deploy`,
    composeFiles,
    composeEnvFile: "compose/compose.env",
    files: Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b))),
    coreImage,
    pulledImages,
    dockerfile: `${deployDir}/docker/Dockerfile`,
    services,
    networks,
    volumes: ["fluxiq-data", "caddy-data", "caddy-config"].map((volume) => `${project}_${volume}`),
    secretsVolume: `${project}_secrets`,
    secrets,
    renderedFiles,
    exportedCa: config.tls.mode === "internal" ? `${config.stateDir}/certs/root.crt` : null,
    mailUi: config.sinks.mail ? `http://127.0.0.1:${config.sinks.mailUiPort}` : null
  };
}

function plannedSecrets(config: CloudConfig): PlannedSecret[] {
  const dir = config.secretsDir;
  const setupCode: PlannedSecret = { name: "setup_code", file: `${dir}/setup-code`, generate: "setup-code" };
  const payments = config.payments;
  // A self-hosted server mounts only the code that claims its owner account.
  if (payments === null) return config.email.passwordFile === null ? [setupCode] : [setupCode, { name: "email_smtp_password", file: config.email.passwordFile, generate: "operator" }];
  const secrets: PlannedSecret[] = [
    { name: "provisioning_token", file: `${dir}/provisioning-token`, generate: "token" },
    setupCode,
    { name: "secret_keyring", file: `${dir}/secret-keyring`, generate: "keyring" },
    payments.secretKeyFile === null
      ? { name: "stripe_secret_key", file: `${dir}/stripe-secret-key`, generate: "stripe-mock-key" }
      : { name: "stripe_secret_key", file: payments.secretKeyFile, generate: "operator" }
  ];
  if (config.billing !== null) {
    secrets.push(payments.webhookSecretFile === null
      ? { name: "stripe_webhook_secret", file: `${dir}/stripe-webhook-secret`, generate: "webhook-secret" }
      : { name: "stripe_webhook_secret", file: payments.webhookSecretFile, generate: "operator" });
  }
  if (config.email.passwordFile !== null) secrets.push({ name: "email_smtp_password", file: config.email.passwordFile, generate: "operator" });
  return secrets;
}
