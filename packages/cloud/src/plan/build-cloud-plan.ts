import type { CloudConfig } from "../config/index.ts";
import { CLOUD_PROJECT_LABEL } from "./project-label.ts";
import { renderComposeEnv, renderOverride, renderServiceEnv, renderSinks } from "./render/index.ts";
import type { CloudPlan, PlannedFile, PlannedSecret } from "./types.ts";

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
  const networks = { edge: `${project}_edge`, provisioning: `${project}_provisioning`, runners: `${project}_runners` };
  const publicOrigin = `https://${config.domain}${config.ports.https === 443 ? "" : `:${config.ports.https}`}`;
  const secrets = plannedSecrets(config);
  const smtpSecret = secrets.find((secret) => secret.name === "email_smtp_password")?.name ?? null;
  const composeFiles = ["compose/service.compose.yml", "compose/cloud.override.yml"];
  if (config.sinks.mail || config.sinks.payments) composeFiles.push("compose/sinks.compose.yml");
  const services = ["fluxiq", "caddy", ...(config.sinks.mail ? ["mailpit"] : []), ...(config.sinks.payments ? ["stripe-mock"] : [])];
  const pulledImages = [config.images.caddy, ...(config.sinks.mail ? [config.images.mailpit] : []), ...(config.sinks.payments ? [config.images.stripeMock] : [])];

  const files: Record<string, PlannedFile> = {
    "caddy/Caddyfile": { copyFrom: `${deployFilesDir}/caddy/Caddyfile.example` },
    "compose/cloud.override.yml": { content: renderOverride() },
    "compose/compose.env": { content: renderComposeEnv(config, coreImage, networks.provisioning) },
    "compose/service.compose.yml": { copyFrom: `${deployFilesDir}/compose/service.compose.yml` },
    "env/service.env": { content: renderServiceEnv(config, publicOrigin, smtpSecret) }
  };
  if (composeFiles.length === 3) files["compose/sinks.compose.yml"] = { content: renderSinks(config.sinks) };
  const upCommand = ["docker", "compose", "--project-name", project, "--env-file", "compose/compose.env", ...composeFiles.flatMap((file) => ["--file", file]), "up", "--detach", "--wait"];
  files["deployment.json"] = {
    content: `${JSON.stringify({
      generatedBy: `@fluxiq/cloud@${packageVersion}`,
      project, profile: config.profile, publicOrigin, image: coreImage,
      label: `${CLOUD_PROJECT_LABEL}=${project}`,
      composeFiles, composeEnvFile: "compose/compose.env",
      secretsVolume: `${project}_secrets`,
      secrets: secrets.map((secret) => ({ name: secret.name, file: secret.file })),
      run: "Create the secrets volume with the project label and copy each secret file into it as <name>, owned by 1000:1000 with mode 0400 (fluxiq-cloud up does both); then, from this folder:",
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
    exportedCa: config.tls.mode === "internal" ? `${config.stateDir}/certs/root.crt` : null,
    mailUi: config.sinks.mail ? `http://127.0.0.1:${config.sinks.mailUiPort}` : null
  };
}

function plannedSecrets(config: CloudConfig): PlannedSecret[] {
  const dir = config.secretsDir;
  const secrets: PlannedSecret[] = [
    { name: "provisioning_token", file: `${dir}/provisioning-token`, generate: "token" },
    { name: "setup_code", file: `${dir}/setup-code`, generate: "setup-code" },
    { name: "secret_keyring", file: `${dir}/secret-keyring`, generate: "keyring" },
    config.payments.secretKeyFile === null
      ? { name: "stripe_secret_key", file: `${dir}/stripe-secret-key`, generate: "stripe-mock-key" }
      : { name: "stripe_secret_key", file: config.payments.secretKeyFile, generate: "operator" }
  ];
  if (config.email.passwordFile !== null) secrets.push({ name: "email_smtp_password", file: config.email.passwordFile, generate: "operator" });
  return secrets;
}
