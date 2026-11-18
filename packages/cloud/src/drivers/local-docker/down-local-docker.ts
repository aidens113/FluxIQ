import { access, readdir, rm, rmdir } from "node:fs/promises";
import path from "node:path";
import { cloudStateStore, type CloudState } from "../../state/index.ts";
import type { DownOptions, DownReport, DriverContext } from "../types.ts";
import { currentUserTrust } from "./current-user-trust.ts";
import { DockerCli } from "./docker-cli.ts";

/**
 * Removes a deployment: Compose's own `down` first (a graceful stop), then
 * every container, network, volume and image carrying the project label,
 * then what the state file records (images pulled because they were absent,
 * the trusted certificate, generated secrets, the exported certificate, the
 * bundle). Nothing unlabelled and unrecorded is ever touched. Running it on
 * nothing succeeds, so it is safe to repeat. With `keepData` the volumes,
 * their secrets and the state stay for the next `up`.
 */
export async function downLocalDocker(state: CloudState, options: DownOptions, context: DriverContext): Promise<DownReport> {
  const docker = new DockerCli(context.runner);
  if (!(await docker.isRunning())) throw new Error("Docker is not running, so down cannot find what to remove. Start Docker Desktop (docker desktop start), then run down again.");
  const report: DownReport = { removed: { containers: 0, networks: 0, volumes: 0, images: 0, files: 0 }, kept: [] };
  const { project } = state;

  if (await exists(path.join(state.bundleDir, state.composeEnvFile))) {
    context.log("Compose: stopping the services.");
    const target = { bundleDir: state.bundleDir, project, composeEnvFile: state.composeEnvFile, composeFiles: state.composeFiles };
    const result = await docker.compose(target, ["down", "--remove-orphans", ...(options.keepData ? [] : ["--volumes"])], { echo: true });
    if (result.code !== 0) context.log(`Compose down exited ${result.code}; removing what remains by label.`);
  }

  const containers = await docker.labelled("container", project);
  if (containers.length > 0) await docker.must(["rm", "--force", ...containers], "Removing this deployment's containers");
  report.removed.containers = containers.length;

  const networks = [...await docker.labelled("network", project)];
  for (const name of state.networks) if (await docker.labelOf("network", name) === project) networks.push(name);
  const uniqueNetworks = [...new Set(networks)];
  if (uniqueNetworks.length > 0) await docker.must(["network", "rm", ...uniqueNetworks], "Removing this deployment's networks");
  report.removed.networks = uniqueNetworks.length;

  if (!options.keepData) {
    const volumes = await docker.labelled("volume", project);
    if (volumes.length > 0) await docker.must(["volume", "rm", ...volumes], "Removing this deployment's volumes");
    report.removed.volumes = volumes.length;
  }

  if (!options.keepImages) {
    for (const reference of await docker.labelled("image", project)) {
      await docker.must(["image", "rm", reference], `Removing the image ${reference}`);
      report.removed.images += 1;
    }
    for (const reference of state.pulledImages) {
      if (!(await docker.imageExists(reference))) continue;
      const result = await docker.run(["image", "rm", reference]);
      if (result.code === 0) report.removed.images += 1;
      else report.kept.push(`${reference}: pulled by up, but something else uses it now`);
    }
  }

  if (!options.keepData && state.trustedCa !== null) {
    if (!(await currentUserTrust.remove(context.runner, state.trustedCa.thumbprint))) report.kept.push(`trusted certificate ${state.trustedCa.thumbprint}: certutil could not remove it from the current user's Root store`);
  }

  const files = [state.bundleDir, ...(options.keepData ? [] : [...state.generatedSecrets, ...(state.exportedCa === null ? [] : [state.exportedCa])])];
  for (const file of files) {
    if (!(await exists(file))) continue;
    await rm(file, { recursive: true, force: true });
    report.removed.files += 1;
  }

  if (options.keepData) {
    await cloudStateStore.write({ ...state, phase: "stopped", pulledImages: options.keepImages ? state.pulledImages : [], trustedCa: state.trustedCa, networks: [] });
  } else {
    await cloudStateStore.remove(state.stateFile);
    await removeEmptyFolders([...state.generatedSecrets, ...(state.exportedCa === null ? [] : [state.exportedCa])].map((file) => path.dirname(file)), path.dirname(state.stateFile));
  }
  return report;
}

/**
 * Removes the folders `down` emptied: the secrets and certificate folders,
 * the deployment's state folder, then the configured state folder holding
 * it. Never one with anything left in it, and nothing above the configured one.
 */
async function removeEmptyFolders(folders: readonly string[], stateDir: string): Promise<void> {
  for (const folder of [...new Set(folders), stateDir, path.dirname(stateDir)]) {
    let entries: string[];
    try { entries = await readdir(folder); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    if (entries.length === 0) await rmdir(folder);
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}
