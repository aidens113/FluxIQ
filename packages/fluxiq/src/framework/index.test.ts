import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ComponentRegistry } from "../components/index.ts";
import { createEnvelope } from "../io/index.ts";
import { AutomationStudioNativeNodeRuntime, type AutomationStudioImporterSdkManifest, type AutomationStudioNodeDefinition } from "../programs/index.ts";
import { FluxIQ } from "./index.ts";

const ENV_KEYS = [
  "FLUXIQ_ROOT",
  "FLUXIQ_DIR",
  "FLUXIQ_DOMAIN_ID",
  "FLUXIQ_HOST_DOMAIN",
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
  it("creates only the layout-v2 config for a fresh host", async () => {
    const root = await tempRoot();
    try {
      const fluxiq = FluxIQ.create({ rootDir: root, loadEnv: false });
      const result = await fluxiq.setup();

      expect(result.paths.root).toBe(root);
      expect(result.paths.data).toBe(path.join(root, ".fluxiq"));
      expect(result.paths.databases).toBe(path.join(root, ".fluxiq"));
      expect(result.paths.domains).toBe(path.join(root, ".fluxiq", "domains"));
      expect(result.paths.domainPrograms).toBe(path.join(root, "domains", "programs"));
      expect(await readdir(path.join(root, ".fluxiq"))).toEqual(["config.json"]);

      const config = JSON.parse(await readFile(result.configPath, "utf8")) as { version: number; layoutVersion: number; createdBy: string };
      expect(config.version).toBe(2);
      expect(config.layoutVersion).toBe(2);
      expect(config.createdBy).toBe("fluxiq");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("keeps global storage global while exposing importer-owned domain roots", async () => {
    const root = await tempRoot();
    try {
      const fluxiq = FluxIQ.create({ rootDir: root, domainId: "Example Domain", loadEnv: false });
      const result = await fluxiq.setup();

      expect(fluxiq.activeDomainId).toBe("example_domain");
      expect(result.paths.domainId).toBe("example_domain");
      expect(result.paths.domainRoot).toBe(path.join(root, ".fluxiq", "domains", "example_domain"));
      expect(result.paths.data).toBe(path.join(root, ".fluxiq"));
      expect(result.paths.databases).toBe(path.join(root, ".fluxiq"));
      expect(result.paths.domainPrograms).toBe(path.join(root, "domains", "example_domain", "programs"));
      expect(result.paths.domainData).toBe(path.join(root, ".fluxiq", "domains", "example_domain", "data"));
      expect(await readdir(path.join(root, ".fluxiq"))).toEqual(["config.json"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("shares global editor state across importer-defined domain identities without eager trees", async () => {
    const root = await tempRoot();
    try {
      const first = FluxIQ.create({ rootDir: root, domainId: "Importer Alpha", loadEnv: false });
      await first.setup();
      const project = await first.programs.automationStudio.createProject({ name: "Importer-owned project" });
      await first.programs.automationStudio.createRecording({
        projectId: project.id,
        recordingId: "recording.shared",
        startedAt: 1,
        initialState: { timestamp: 1, namespaces: {} }
      });

      const projectRoot = path.join(root, ".fluxiq", "artifacts", "automation-studio", "projects", project.id);
      const directories = await readdir(projectRoot, { recursive: true, withFileTypes: true })
        .then((entries) => entries.filter((entry) => entry.isDirectory()), () => []);
      expect(directories.length).toBeLessThan(10);
      const second = FluxIQ.create({ rootDir: root, domainId: "Importer Beta", loadEnv: false });
      expect((await second.programs.automationStudio.listProjects()).projects).toContainEqual(expect.objectContaining({ id: project.id }));
      expect((await second.programs.automationStudio.getRecordingSession("recording.shared", project.id)).recordingId).toBe("recording.shared");
      expect(second.paths.databases).toBe(path.join(root, ".fluxiq"));
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
      expect(fluxiq.paths.config).toBe(path.join(root, ".framework", "config.json"));
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

  it("creates an Automation Studio IO recorder for the active importer domain", () => {
    const fluxiq = FluxIQ.create({ loadEnv: false, domainId: "example" });

    expect(fluxiq.createAutomationStudioIoRecorder()).toBeDefined();
    expect(() => FluxIQ.create({ loadEnv: false }).createAutomationStudioIoRecorder()).toThrow("domainId is required");
  });

  it("binds Automation Studio native runtimes through framework options and host modules", async () => {
    const root = await tempRoot();
    try {
      const definition: AutomationStudioNodeDefinition = {
        schemaVersion: "0.1",
        id: "example.echo",
        version: "1.0.0",
        label: "Echo",
        description: "Returns a fixed value.",
        category: "Tests",
        source: { kind: "code", moduleId: "nodes/echo.ts", implementationKey: "echo", trust: "trusted-local" },
        availability: { kind: "domain", domainId: "example" },
        capabilities: { executable: true, codeBacked: true },
        inputs: [],
        outputs: [{ id: "value", label: "Value", valueType: "string" }],
        parameters: []
      };
      const manifest: AutomationStudioImporterSdkManifest = {
        schemaVersion: "0.1",
        sdkVersion: "0.1",
        packageId: "example.package",
        packageVersion: "1.0.0",
        domainId: "example",
        nodes: [definition]
      };
      const nativeRuntime = new AutomationStudioNativeNodeRuntime().register(manifest, {
        packageId: "example.package",
        packageVersion: "1.0.0",
        implementations: { echo: () => ({ outputs: { value: "ok" } }) }
      });
      const fluxiq = FluxIQ.create({ rootDir: root, loadEnv: false, domainId: "example", nativeNodeRuntime: nativeRuntime });
      await fluxiq.setup();
      const project = await fluxiq.programs.automationStudio.createProject({ name: "Native project", domainId: "example" });

      await expect(fluxiq.programs.automationStudio.listNativeNodeDefinitions(project.id)).resolves.toContainEqual(expect.objectContaining({ id: "example.echo" }));

      const lateBound = FluxIQ.create({ rootDir: root, loadEnv: false, domainId: "example" });
      await lateBound.setup();
      const lateProject = await lateBound.programs.automationStudio.createProject({ name: "Late native project", domainId: "example" });
      lateBound.bindAutomationStudioNativeNodeRuntime(nativeRuntime);
      await expect(lateBound.programs.automationStudio.listNativeNodeDefinitions(lateProject.id)).resolves.toContainEqual(expect.objectContaining({ id: "example.echo" }));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
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
