import type { CloudStatus } from "../drivers/index.ts";

/** `fluxiq-cloud status` as a table a person reads. */
export function formatStatus(status: CloudStatus): string {
  const lines = [`Project ${status.project}: ${status.phase}`];
  if (!status.dockerRunning) return `${lines[0]}\nDocker is not running; start it to see the services.\n`;
  if (status.services.length === 0) lines.push("No containers.");
  else {
    const width = Math.max(...status.services.map((service) => service.service.length), 7);
    lines.push(`${"SERVICE".padEnd(width)}  STATE      HEALTH     PORTS`);
    for (const service of status.services) lines.push(`${service.service.padEnd(width)}  ${service.state.padEnd(9)}  ${(service.health ?? "-").padEnd(9)}  ${service.ports || "-"}`);
  }
  lines.push(`Panel: ${status.urls.panel}`);
  if (status.urls.mail !== null) lines.push(`Mail (Mailpit): ${status.urls.mail}`);
  const { containers, networks, volumes, images } = status.labelled;
  lines.push(`Labelled: ${containers} containers, ${networks} networks, ${volumes} volumes, ${images} images`);
  return `${lines.join("\n")}\n`;
}
