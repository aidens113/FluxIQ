import type { CommandRequest, CommandResult, CommandRunner } from "../../../command/index.ts";

type Labels = Record<string, string>;
const PROJECT_LABEL = "com.fluxiq.cloud.project";

/** What the fake knows about the deployment Compose would start. */
export type FakeComposeProject = { coreImage: string; services: string[]; pulledImages: string[] };

/**
 * A Docker Engine in memory, behind the command runner: containers,
 * networks, volumes and images with labels, and the `docker` and `docker
 * compose` commands the local driver sends. It records every call, so a test
 * can check what was removed and that nothing else was touched.
 */
export class FakeDocker implements CommandRunner {
  readonly calls: { command: string; args: string[]; input: string | undefined }[] = [];
  /** What the secrets volume holds, by file name (the one-shot sync writes it). */
  readonly secretsVolumeFiles = new Map<string, string>();
  readonly containers = new Map<string, { labels: Labels; image: string }>();
  readonly networks = new Map<string, Labels>();
  readonly volumes = new Map<string, Labels>();
  readonly images = new Map<string, Labels>();
  readonly trusted = new Set<string>();
  running = true;
  failComposeUp = false;
  readonly pem = "-----BEGIN CERTIFICATE-----\nMIIBszCCAVmgAwIBAgIQ\n-----END CERTIFICATE-----\n";
  private readonly project: FakeComposeProject;
  private nextId = 1;

  constructor(project: FakeComposeProject) {
    this.project = project;
  }

  async run(command: string, request: CommandRequest): Promise<CommandResult> {
    const args = [...request.args];
    this.calls.push({ command, args, input: request.input });
    if (command === "certutil") return this.certutil(args);
    if (command !== "docker" || !this.running) return fail("Cannot connect to the Docker daemon");
    const [verb = "", ...rest] = args;
    if (verb === "version") return ok("29.9.3");
    if (verb === "image") return this.image(rest);
    if (verb === "ps") return this.ps(rest);
    if (verb === "rm") return this.remove(this.containers, rest.filter((arg) => !arg.startsWith("--")));
    if (verb === "network") return this.network(rest);
    if (verb === "volume") return this.volume(rest);
    if (verb === "compose") return this.compose(rest);
    if (verb === "build") {
      // The runner image: tagged and labelled as built.
      this.images.set(rest[rest.indexOf("--tag") + 1] ?? "", parseLabels(rest));
      return ok("");
    }
    if (verb === "run" && rest[rest.indexOf("--entrypoint") + 1] === "stat") return ok("0");
    if (verb === "run") return this.oneShot(rest, request.input ?? "");
    return fail(`fake docker does not know ${verb}`);
  }

  /** The project names on every resource, for "nothing of anyone else's was touched". */
  labelled(project: string): { containers: string[]; networks: string[]; volumes: string[]; images: string[] } {
    const of = (map: Map<string, Labels>) => [...map].filter(([, labels]) => labels[PROJECT_LABEL] === project).map(([name]) => name);
    return { containers: [...this.containers].filter(([, entry]) => entry.labels[PROJECT_LABEL] === project).map(([id]) => id), networks: of(this.networks), volumes: of(this.volumes), images: of(this.images) };
  }

  private certutil(args: string[]): CommandResult {
    if (args.includes("-addstore")) {
      this.trusted.add("added");
      return ok("");
    }
    const thumbprint = args.at(-1) ?? "";
    return this.trusted.delete("added") || this.trusted.delete(thumbprint) ? ok("") : fail("not found");
  }

  private image(rest: string[]): CommandResult {
    const [sub = ""] = rest;
    if (sub === "inspect") return this.images.has(rest.at(-1) ?? "") ? ok("sha256:x") : fail("No such image");
    if (sub === "ls") {
      const filter = labelFilter(rest);
      return ok([...this.images].filter(([, labels]) => matches(labels, filter)).map(([reference]) => `${reference} sha256-${reference.length}`).join("\n"));
    }
    if (sub === "rm") {
      const reference = rest.at(-1) ?? "";
      if ([...this.containers.values()].some((container) => container.image === reference)) return fail("image is being used by a container");
      return this.images.delete(reference) ? ok("") : fail("No such image");
    }
    return fail(`image ${sub}`);
  }

  private ps(rest: string[]): CommandResult {
    const filter = labelFilter(rest);
    const found = [...this.containers].filter(([, entry]) => matches(entry.labels, filter));
    if (rest.includes("--quiet")) return ok(found.map(([id]) => id).join("\n"));
    return ok(found.map(([id, entry]) => JSON.stringify({ Names: id, State: "running", Status: "Up 1 minute (healthy)", Ports: "", Labels: Object.entries(entry.labels).map(([key, value]) => `${key}=${value}`).join(",") })).join("\n"));
  }

  private oneShot(rest: string[], input: string): CommandResult {
    const volume = rest[rest.indexOf("--volume") + 1]?.split(":")[0] ?? "";
    if (!this.volumes.has(volume)) return fail(`no volume ${volume}`);
    if (!this.images.has(rest[rest.indexOf("--entrypoint") + 2] ?? "")) return fail("Unable to find image");
    const files = JSON.parse(input) as Record<string, string>;
    this.secretsVolumeFiles.clear();
    for (const [name, content] of Object.entries(files)) this.secretsVolumeFiles.set(name, content);
    return ok(JSON.stringify(Object.keys(files).sort()));
  }

  private network(rest: string[]): CommandResult {
    const [sub = ""] = rest;
    if (sub === "inspect") {
      const labels = this.networks.get(rest.at(-1) ?? "");
      return labels === undefined ? fail("network not found") : ok(labels[PROJECT_LABEL] ?? "<no value>");
    }
    if (sub === "create") {
      this.networks.set(rest.at(-1) ?? "", parseLabels(rest));
      return ok("id");
    }
    if (sub === "ls") return ok([...this.networks].filter(([, labels]) => matches(labels, labelFilter(rest))).map(([name]) => name).join("\n"));
    if (sub === "rm") return this.remove(this.networks, rest.slice(1));
    return fail(`network ${sub}`);
  }

  private volume(rest: string[]): CommandResult {
    const [sub = ""] = rest;
    if (sub === "ls") return ok([...this.volumes].filter(([, labels]) => matches(labels, labelFilter(rest))).map(([name]) => name).join("\n"));
    if (sub === "rm") return this.remove(this.volumes, rest.slice(1));
    if (sub === "inspect") {
      const labels = this.volumes.get(rest.at(-1) ?? "");
      return labels === undefined ? fail("no such volume") : ok(labels[PROJECT_LABEL] ?? "<no value>");
    }
    if (sub === "create") {
      this.volumes.set(rest.at(-1) ?? "", parseLabels(rest));
      return ok(rest.at(-1) ?? "");
    }
    return fail(`volume ${sub}`);
  }

  private compose(rest: string[]): CommandResult {
    const project = rest[rest.indexOf("--project-name") + 1] ?? "";
    let index = 0;
    while (index < rest.length && (rest[index] ?? "").startsWith("--")) index += 2;
    const [sub = "", ...tail] = rest.slice(index);
    const labels = { [PROJECT_LABEL]: project, "com.docker.compose.project": project };
    if (sub === "build") {
      this.images.set(this.project.coreImage, { [PROJECT_LABEL]: project });
      return ok("built");
    }
    if (sub === "up") {
      if (this.failComposeUp) return fail("service fluxiq is unhealthy");
      if (!this.images.has(this.project.coreImage)) return fail("pull access denied for the core image");
      for (const image of this.project.pulledImages) if (!this.images.has(image)) this.images.set(image, {});
      for (const name of ["edge", "provisioning"]) if (!this.networks.has(`${project}_${name}`)) this.networks.set(`${project}_${name}`, { ...labels });
      for (const name of ["fluxiq-data", "caddy-data", "caddy-config"]) if (!this.volumes.has(`${project}_${name}`)) this.volumes.set(`${project}_${name}`, { ...labels });
      for (const service of this.project.services) {
        const id = `${project}-${service}-1`;
        if (!this.containers.has(id)) this.containers.set(id, { labels: { ...labels, "com.docker.compose.service": service }, image: service === "fluxiq" ? this.project.coreImage : service });
      }
      return ok("");
    }
    if (sub === "down") {
      for (const [id, entry] of this.containers) if (entry.labels["com.docker.compose.project"] === project) this.containers.delete(id);
      for (const name of ["edge", "provisioning"]) this.networks.delete(`${project}_${name}`);
      if (tail.includes("--volumes")) for (const name of ["fluxiq-data", "caddy-data", "caddy-config"]) this.volumes.delete(`${project}_${name}`);
      return ok("");
    }
    if (sub === "exec") return this.containers.has(`${project}-caddy-1`) ? ok(this.pem) : fail("service caddy is not running");
    if (sub === "ps") return ok(this.containers.has(`${project}-caddy-1`) ? `${project}-caddy-1` : "");
    return fail(`compose ${sub}`);
  }

  private remove<T>(map: Map<string, T>, names: string[]): CommandResult {
    const missing = names.filter((name) => !map.has(name));
    if (missing.length > 0) return fail(`No such object: ${missing.join(", ")}`);
    for (const name of names) map.delete(name);
    return ok("");
  }
}

function parseLabels(args: string[]): Labels {
  const labels: Labels = {};
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== "--label") continue;
    const [key = "", value = ""] = (args[index + 1] ?? "").split("=");
    labels[key] = value;
  }
  return labels;
}

function labelFilter(args: string[]): [string, string] | null {
  const index = args.indexOf("--filter");
  if (index === -1) return null;
  const value = (args[index + 1] ?? "").replace(/^label=/u, "");
  const at = value.indexOf("=");
  return [value.slice(0, at), value.slice(at + 1)];
}

function matches(labels: Labels, filter: [string, string] | null): boolean {
  return filter === null || labels[filter[0]] === filter[1];
}

function ok(stdout: string): CommandResult {
  return { code: 0, stdout, stderr: "" };
}

function fail(stderr: string): CommandResult {
  return { code: 1, stdout: "", stderr };
}
