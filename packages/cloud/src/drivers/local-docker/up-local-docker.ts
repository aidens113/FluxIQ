import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { CLOUD_PROJECT_LABEL, writeBundle, type CloudPlan, type PlannedEnvironments } from "../../plan/index.ts";
import { ensureSecrets } from "../../secrets/index.ts";
import { cloudStateStore, type CloudState } from "../../state/index.ts";
import type { DriverContext, UpOptions } from "../types.ts";
import { currentUserTrust } from "./current-user-trust.ts";
import { DockerCli, type ComposeTarget } from "./docker-cli.ts";
import { readBaseImage } from "./read-base-image.ts";
import { syncSecretsVolume } from "./sync-secrets-volume.ts";

const CADDY_ROOT_CERTIFICATE = "/data/caddy/pki/authorities/local/root.crt";

/**
 * Makes a plan real with Docker Compose on this machine. Each step records
 * what it creates in the state file before going on, so `down` can remove a
 * half-finished `up`. A second `up` finds everything present and changes
 * nothing: secrets are never regenerated, the image is built only when
 * missing (or with --build), and Compose leaves running services alone.
 */
export async function upLocalDocker(plan: CloudPlan, options: UpOptions, context: DriverContext): Promise<CloudState> {
  const docker = new DockerCli(context.runner);
  if (!(await docker.isRunning())) throw new Error("Docker is not running. Start Docker Desktop (docker desktop start) or the Docker service, then run up again.");
  const previous = await cloudStateStore.read(plan.stateFile);
  const state: CloudState = {
    ...(previous ?? cloudStateStore.empty(plan)),
    profile: plan.config.profile, driver: plan.config.driver, bundleDir: plan.bundleDir, composeFiles: plan.composeFiles,
    composeEnvFile: plan.composeEnvFile, coreImage: plan.coreImage, publicOrigin: plan.publicOrigin, mailUi: plan.mailUi
  };
  const record = async (change: Partial<CloudState>) => {
    Object.assign(state, change);
    await cloudStateStore.write(state);
  };

  context.log("Secrets: checking the files the deployment mounts.");
  const generated = await ensureSecrets(plan.secrets);
  await record({ phase: "starting", generatedSecrets: union(state.generatedSecrets, generated) });
  for (const file of generated) context.log(`  generated ${file}`);

  const build = options.build || !(await docker.imageExists(plan.coreImage));
  const baseImage = build ? readBaseImage(await readFile(plan.dockerfile, "utf8")) : null;
  const absent: string[] = [];
  for (const reference of [...plan.pulledImages, ...(baseImage === null ? [] : [baseImage])]) {
    if (!(await docker.imageExists(reference))) absent.push(reference);
  }
  await record({ pulledImages: union(state.pulledImages, absent) });

  await writeBundle(plan, plan.bundleDir);
  context.log(`Bundle: wrote ${plan.bundleDir}`);
  await ensureRunnersNetwork(docker, plan, state, record);

  const target: ComposeTarget = { bundleDir: plan.bundleDir, project: plan.project, composeEnvFile: plan.composeEnvFile, composeFiles: plan.composeFiles };
  if (build) {
    context.log(`Image: building ${plan.coreImage} from ${plan.dockerfile} (this takes a while the first time).`);
    await mustCompose(docker, target, ["build", "fluxiq"], "Building Core's image");
  }
  const composeEnv: Record<string, string> = {};
  if (plan.environments !== null) {
    await buildRunnerImage(docker, plan, plan.environments, options.build, state, record, context);
    composeEnv.FLUXIQ_DOCKER_SOCKET_GROUP = await engineSocketGroup(docker, plan);
    context.log(`Environments: Core's docker driver reaches the engine socket in group ${composeEnv.FLUXIQ_DOCKER_SOCKET_GROUP}.`);
  }
  context.log(`Secrets: copying them into the ${plan.secretsVolume} volume, owned by Core's user and readable only by it.`);
  await syncSecretsVolume(docker, plan);
  context.log("Compose: starting the services and waiting until they are healthy.");
  await mustCompose(docker, target, ["up", "--detach", "--wait", "--remove-orphans"], "Starting the services", composeEnv);

  if (plan.exportedCa !== null) {
    const pem = await exportLocalCa(docker, target, context);
    await mkdir(path.dirname(plan.exportedCa), { recursive: true });
    await writeFile(plan.exportedCa, pem, "utf8");
    await record({ exportedCa: plan.exportedCa });
    context.log(`TLS: Caddy's local root certificate is at ${plan.exportedCa}; clients pin it.`);
    if (plan.config.tls.trustLocalCa) await trustLocally(pem, plan.exportedCa, state, record, context);
    const authority = plan.environments?.authoritySecret ?? null;
    if (authority !== null) {
      await syncSecretsVolume(docker, plan, { [authority]: pem });
      context.log("Environments: dedicated browsers trust the local root (it is public), read by Core when it creates one.");
    }
  }
  await record({ phase: "up" });
  return state;
}

/** What the runner image is built from: the extension checkout's built extension and browser host. */
const RUNNER_INPUTS = ["apps/extension/dist/chrome/manifest.json", "packages/browser-host/dist/runner/main.js"];

/**
 * Builds the dedicated browsers' runner image from the extension checkout when
 * it is missing (or with --build), labelled with the project so `down`
 * removes it; its base image is recorded when it was absent, as Core's is.
 */
async function buildRunnerImage(docker: DockerCli, plan: CloudPlan, environments: PlannedEnvironments, rebuild: boolean, state: CloudState, record: (change: Partial<CloudState>) => Promise<void>, context: DriverContext): Promise<void> {
  if (!rebuild && await docker.imageExists(environments.image)) return;
  const missing = [];
  for (const input of RUNNER_INPUTS) if (!(await exists(path.join(environments.context, input)))) missing.push(input);
  if (missing.length > 0) throw new Error(`The runner image needs the extension checkout at ${environments.context} built first; missing ${missing.join(", ")}. Build them there with "pnpm --filter @fluxiq-web-extension/extension build" and "pnpm --filter @fluxiq-web-extension/browser-host build", then run up again.`);
  const dockerfile = path.join(environments.context, environments.dockerfile);
  const base = readBaseImage(await readFile(dockerfile, "utf8"));
  if (base !== null && !(await docker.imageExists(base))) await record({ pulledImages: union(state.pulledImages, [base]) });
  context.log(`Image: building ${environments.image} from ${dockerfile} (Chromium, the extension and its runner).`);
  const result = await docker.run(["build", "--label", `${CLOUD_PROJECT_LABEL}=${plan.project}`, "--label", "com.fluxiq.cloud.role=runner", "--tag", environments.image, "--file", dockerfile, environments.context], { echo: true });
  if (result.code !== 0) throw new Error(`Building the runner image failed (docker exited ${result.code}). "fluxiq-cloud down" removes what was created.`);
}

/** The group that owns the engine's socket, as Core's container sees it, so Core joins it and nothing more. */
async function engineSocketGroup(docker: DockerCli, plan: CloudPlan): Promise<string> {
  const stdout = await docker.must(["run", "--rm", "--network", "none", "--label", `${CLOUD_PROJECT_LABEL}=${plan.project}`, "--read-only", "--cap-drop", "ALL",
    "--volume", "/var/run/docker.sock:/var/run/docker.sock:ro", "--entrypoint", "stat", plan.coreImage, "-c", "%g", "/var/run/docker.sock"], "Finding the engine socket's group");
  const group = stdout.trim();
  if (!/^[0-9]+$/u.test(group)) throw new Error(`The engine socket's group is not a number: ${group}`);
  return group;
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function ensureRunnersNetwork(docker: DockerCli, plan: CloudPlan, state: CloudState, record: (change: Partial<CloudState>) => Promise<void>): Promise<void> {
  const name = plan.networks.runners;
  const owner = await docker.labelOf("network", name);
  if (owner === plan.project) return;
  if (owner !== null) throw new Error(`A network named ${name} exists and is not this deployment's; remove or rename it, or choose another project name.`);
  await docker.must(["network", "create", "--label", `${CLOUD_PROJECT_LABEL}=${plan.project}`, "--label", "com.fluxiq.cloud.role=runners",
    // One customer's browser must never reach another's: no traffic between containers on this network.
    "--opt", "com.docker.network.bridge.enable_icc=false", name], "Creating the runners network");
  await record({ networks: union(state.networks, [name]) });
}

async function mustCompose(docker: DockerCli, target: ComposeTarget, args: string[], step: string, env: Record<string, string> = {}): Promise<void> {
  const result = await docker.compose(target, args, { echo: true, env });
  if (result.code !== 0) throw new Error(`${step} failed (docker compose exited ${result.code}). "fluxiq-cloud status" shows each service; "fluxiq-cloud down" removes what was created.`);
}

/** Waits for Caddy's local authority to exist (it is created as Caddy loads its config) and answers its root certificate. */
async function exportLocalCa(docker: DockerCli, target: ComposeTarget, context: DriverContext): Promise<string> {
  for (;;) {
    const read = await docker.compose(target, ["exec", "-T", "caddy", "cat", CADDY_ROOT_CERTIFICATE]);
    if (read.code === 0 && read.stdout.includes("BEGIN CERTIFICATE")) return read.stdout;
    const running = await docker.compose(target, ["ps", "--status", "running", "--quiet", "caddy"]);
    if (running.code !== 0 || running.stdout.trim() === "") throw new Error("Caddy is not running, so its local certificate authority cannot be exported. \"fluxiq-cloud status\" and \"docker compose logs caddy\" (in the bundle folder) say why.");
    await context.sleep(1000);
  }
}

async function trustLocally(pem: string, file: string, state: CloudState, record: (change: Partial<CloudState>) => Promise<void>, context: DriverContext): Promise<void> {
  const thumbprint = currentUserTrust.thumbprint(pem);
  if (state.trustedCa?.thumbprint === thumbprint) return;
  if (state.trustedCa !== null) await currentUserTrust.remove(context.runner, state.trustedCa.thumbprint);
  await currentUserTrust.add(context.runner, context.platform, file);
  await record({ trustedCa: { thumbprint } });
  context.log("TLS: the local root certificate is trusted for the current Windows user; down removes it.");
}

function union(existing: readonly string[], added: readonly string[]): string[] {
  return [...new Set([...existing, ...added])];
}
