import type { CloudState } from "../../state/index.ts";
import type { CloudStatus, DriverContext, ServiceStatus } from "../types.ts";
import { DockerCli } from "./docker-cli.ts";
import { CLOUD_PROJECT_LABEL } from "../../plan/index.ts";

type ContainerRow = { Labels?: string; State?: string; Status?: string; Ports?: string; Names?: string };

/**
 * Reports a deployment: each labelled container's service, state, health
 * and published ports, the panel's URL (and Mailpit's), and how many
 * labelled resources of each kind exist. Read-only.
 */
export async function statusLocalDocker(state: CloudState, context: DriverContext): Promise<CloudStatus> {
  const docker = new DockerCli(context.runner);
  const status: CloudStatus = {
    project: state.project, phase: state.phase, dockerRunning: await docker.isRunning(), services: [],
    urls: { panel: state.publicOrigin, mail: state.mailUi }, labelled: { containers: 0, networks: 0, volumes: 0, images: 0 }
  };
  if (!status.dockerRunning) return status;
  const rows = await docker.must(["ps", "--all", "--filter", `label=${CLOUD_PROJECT_LABEL}=${state.project}`, "--format", "{{json .}}"], "Listing this deployment's containers");
  status.services = rows.split(/\r?\n/u).filter((line) => line.trim() !== "").map((line) => serviceOf(JSON.parse(line) as ContainerRow)).sort((a, b) => a.service.localeCompare(b.service));
  status.labelled = {
    containers: status.services.length,
    networks: (await docker.labelled("network", state.project)).length,
    volumes: (await docker.labelled("volume", state.project)).length,
    images: (await docker.labelled("image", state.project)).length
  };
  return status;
}

function serviceOf(row: ContainerRow): ServiceStatus {
  const labels = new Map((row.Labels ?? "").split(",").map((pair) => {
    const at = pair.indexOf("=");
    return [pair.slice(0, at), pair.slice(at + 1)] as const;
  }));
  const health = /\((healthy|unhealthy|health: starting)\)/u.exec(row.Status ?? "")?.[1] ?? null;
  return { service: labels.get("com.docker.compose.service") ?? row.Names ?? "?", state: row.State ?? "unknown", health, ports: row.Ports ?? "" };
}
