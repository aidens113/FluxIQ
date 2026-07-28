import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ComponentRegistry } from "../components";
import { createEnvelope } from "../io";
import { FluxIQ } from "./index";

const ENV_KEYS = [
  "FLUXIQ_ROOT",
  "FLUXIQ_DIR",
  "FLUXIQ_DATA_DIR",
  "FLUXIQ_DATABASES_DIR",
  "FLUXIQ_INPUTS_DIR",
  "FLUXIQ_OUTPUTS_DIR",
  "FLUXIQ_STREAMS_DIR",
  "FLUXIQ_DOMAINS_DIR",
  "FLUXIQ_DOMAIN_PROGRAMS_DIR",
  "FLUXIQ_DOMAIN_INPUTS_DIR",
  "FLUXIQ_DOMAIN_OUTPUTS_DIR",
  "FLUXIQ_DOMAIN_CONFIGS_DIR",
  "FLUXIQ_DOMAIN_DATA_DIR",
  "FLUXIQ_DOMAIN_DATABASES_DIR",
  "FLUXIQ_RECORDINGS_DIR",
  "FLUXIQ_POLICIES_DIR",
  "FLUXIQ_LOGS_DIR",
  "FLUXIQ_TEMP_DIR"
] as const;

const savedEnv = new Map<string, string | undefined>();

beforeEach(() => {
  for (const key of ENV_KEYS) {
    savedEnv.set(key, process.env[key]);
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = savedEnv.get(key);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  savedEnv.clear();
});

describe("FluxIQ", () => {
  it("creates host project folders and config", async () => {
    const root = await tempRoot();
    try {
      const fluxiq = FluxIQ.create({ rootDir: root, loadEnv: false });
      const result = await fluxiq.setup();

      expect(result.paths.root).toBe(root);
      expect(result.paths.data).toBe(path.join(root, ".fluxiq", "data"));
      expect(result.paths.databases).toBe(path.join(root, ".fluxiq", "databases"));
      expect(result.paths.inputs).toBe(path.join(root, ".fluxiq", "inputs"));
      expect(result.paths.outputs).toBe(path.join(root, ".fluxiq", "outputs"));
      expect(result.paths.domains).toBe(path.join(root, ".fluxiq", "domains"));
      expect(result.paths.domainPrograms).toBe(path.join(root, ".fluxiq", "domains", "programs"));
      expect(result.paths.domainInputs).toBe(path.join(root, ".fluxiq", "domains", "inputs"));
      expect(result.paths.domainOutputs).toBe(path.join(root, ".fluxiq", "domains", "outputs"));
      await expect(stat(path.join(result.paths.domainPrograms, "README.md"))).resolves.toBeTruthy();
      await expect(stat(path.join(result.paths.inputs, "README.md"))).resolves.toBeTruthy();

      const config = JSON.parse(await readFile(result.configPath, "utf8")) as { version: number; createdBy: string };
      expect(config.version).toBe(1);
      expect(config.createdBy).toBe("fluxiq");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("uses environment variables for root and storage paths", async () => {
    const root = await tempRoot();
    try {
      await writeFile(path.join(root, ".env"), "FLUXIQ_DIR=.framework\nFLUXIQ_DATA_DIR=var/data\nFLUXIQ_DOMAIN_PROGRAMS_DIR=domain-programs\n", "utf8");

      const fluxiq = FluxIQ.create({ rootDir: root });

      expect(fluxiq.paths.fluxiq).toBe(path.join(root, ".framework"));
      expect(fluxiq.paths.config).toBe(path.join(root, ".framework", "config"));
      expect(fluxiq.paths.data).toBe(path.join(root, "var", "data"));
      expect(fluxiq.paths.domainPrograms).toBe(path.join(root, "domain-programs"));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("lets explicit options override environment variables", async () => {
    const root = await tempRoot();
    try {
      await writeFile(path.join(root, ".env"), "FLUXIQ_DATA_DIR=from-env\n", "utf8");

      const fluxiq = FluxIQ.create({ rootDir: root, dataDir: "from-options" });

      expect(fluxiq.paths.data).toBe(path.join(root, "from-options"));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("builds a scoped program directory from registered domains", () => {
    const fluxiq = FluxIQ.create({ loadEnv: false });
    fluxiq.registerDomain({
      manifest: {
        id: "example",
        title: "Example",
        category: "Tests",
        description: "Test domain",
        icon: "blocks"
      }
    });

    const directory = fluxiq.programDirectory("example");

    expect(directory.domain?.id).toBe("example");
    expect(directory.domains).toHaveLength(1);
    expect(directory.programs.every((program) => program.scope === "domain")).toBe(true);
  });

  it("registers IO and validates domain manifests", () => {
    const fluxiq = FluxIQ.create({ loadEnv: false });
    fluxiq.registerDomain({
      manifest: {
        id: "example",
        title: "Example",
        category: "Tests",
        description: "Test domain",
        icon: "blocks",
        inputs: [{ id: "state", title: "State" }],
        outputs: [{ id: "action", title: "Action" }]
      }
    });
    fluxiq.registerIo({
      domainId: "example",
      inputs: [{
        definition: { id: "state", title: "State" },
        mode: "request",
        read: () => createEnvelope({ domainId: "example", ioId: "state", payload: { ready: true } })
      }]
    });

    expect(fluxiq.ioSnapshot("example").inputs).toHaveLength(1);
    expect(fluxiq.validateDomainIo("example").map((issue) => issue.code)).toEqual(["domain.output.adapter_missing"]);
  });

  it("validates component IO requirements", () => {
    const fluxiq = FluxIQ.create({ loadEnv: false });
    fluxiq.registerIo({
      domainId: "example",
      inputs: [{
        definition: { id: "state", title: "State" },
        mode: "request",
        read: () => createEnvelope({ domainId: "example", ioId: "state", payload: {} })
      }]
    });
    const components = new ComponentRegistry();
    components.register({
      spec: {
        nodeType: "test.action",
        displayName: "Action",
        category: "Tests",
        description: "Requires IO",
        params: [],
        resultStates: ["success"],
        requiredInputs: ["state"],
        requiredOutputs: ["action"]
      },
      handler: () => ({ state: "success" })
    });

    const issues = fluxiq.validateComponentIo("example", components);

    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe("runtime.output.required_missing");
  });
});

async function tempRoot(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "fluxiq-"));
}
