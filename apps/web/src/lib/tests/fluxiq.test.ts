import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FluxIQ } from "fluxiq";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyFluxIQHostModule, closeFluxIQWebRuntime, createFluxIQWebInstance, getFluxIQ, getFluxIQWebReadiness, getFluxIQWebRuntimeStatus, initializeFluxIQWebRuntime, loadFluxIQHostModule, reloadFluxIQWebInstance, resolveFluxIQHostModulePath, resolveFluxIQWebHostRoot } from "../fluxiq";

// The owner-claim module is built beside this one; the runtime only needs its answer.
const ownerClaim = vi.hoisted(() => ({ prepare: vi.fn(async (_input: unknown) => ({ claimed: false, codeFile: "/setup-code-file" })) }));
vi.mock("../../server/owner-claim", () => ({ prepareOwnerClaim: ownerClaim.prepare }));

const originalEnv = {
  FLUXIQ_MODEL_PROVIDERS_ENABLED: process.env.FLUXIQ_MODEL_PROVIDERS_ENABLED,
  FLUXIQ_ALLOW_FRAMEWORK_REPO_ROOT: process.env.FLUXIQ_ALLOW_FRAMEWORK_REPO_ROOT,
  FLUXIQ_CLIENT_GATEWAY_ENABLED: process.env.FLUXIQ_CLIENT_GATEWAY_ENABLED,
  FLUXIQ_DOMAIN_ID: process.env.FLUXIQ_DOMAIN_ID,
  FLUXIQ_HOST_DOMAIN: process.env.FLUXIQ_HOST_DOMAIN,
  FLUXIQ_HOST_MODULE: process.env.FLUXIQ_HOST_MODULE,
  FLUXIQ_HOST_ROOT: process.env.FLUXIQ_HOST_ROOT,
  FLUXIQ_IMPORTER_ROOT: process.env.FLUXIQ_IMPORTER_ROOT,
  FLUXIQ_ROOT: process.env.FLUXIQ_ROOT,
  FLUXIQ_PROFILE: process.env.FLUXIQ_PROFILE,
  FLUXIQ_PUBLIC_ORIGIN: process.env.FLUXIQ_PUBLIC_ORIGIN,
  FLUXIQ_PROVISIONING_LISTEN: process.env.FLUXIQ_PROVISIONING_LISTEN,
  FLUXIQ_PROVISIONING_TOKEN_FILE: process.env.FLUXIQ_PROVISIONING_TOKEN_FILE,
  FLUXIQ_PUBLIC_CLIENT_WS_URL: process.env.FLUXIQ_PUBLIC_CLIENT_WS_URL,
  FLUXIQ_SETUP_CODE_FILE: process.env.FLUXIQ_SETUP_CODE_FILE,
  FLUXIQ_DRAIN_SECONDS: process.env.FLUXIQ_DRAIN_SECONDS
};

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  delete (globalThis as typeof globalThis & { __fluxiqWebHostModule?: unknown }).__fluxiqWebHostModule;
});

/**
 * A directory that resolves `fluxiq` from node_modules as an importing
 * repository does, so a host written there goes through the package exports map.
 */
function importingRepositoryDir(): string {
  const dir = fileURLToPath(new URL("../../../node_modules/.cache/", import.meta.url));
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("FluxIQ web host module loading", () => {
  it("returns null when no host module is configured", () => {
    delete process.env.FLUXIQ_HOST_MODULE;

    expect(resolveFluxIQHostModulePath()).toBeNull();
  });

  it("fails loudly when the configured host module is missing", () => {
    // Inside a directory of its own, so no other run can have created it.
    process.env.FLUXIQ_HOST_MODULE = path.join(mkdtempSync(path.join(os.tmpdir(), "fluxiq-missing-host-module-")), "missing-fluxiq-host-module.cjs");

    expect(() => resolveFluxIQHostModulePath()).toThrow("FLUXIQ_HOST_MODULE points to a missing file");
  });

  it("applies registerFluxIQHost from the configured host module", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "fluxiq-host-module-"));
    const modulePath = path.join(root, "host.cjs");
    writeFileSync(modulePath, "module.exports.registerFluxIQHost = (fluxiq) => { fluxiq.__hostRegistered = 'named'; return fluxiq; };\n");
    process.env.FLUXIQ_HOST_MODULE = modulePath;
    await loadFluxIQHostModule();
    const fluxiq = FluxIQ.create({ rootDir: root });

    expect(applyFluxIQHostModule(fluxiq)).toBe(fluxiq);
    expect((fluxiq as unknown as { __hostRegistered?: string }).__hostRegistered).toBe("named");

    rmSync(root, { recursive: true, force: true });
  });

  it("applies a default export from the configured host module", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "fluxiq-host-module-"));
    const modulePath = path.join(root, "host-default.cjs");
    writeFileSync(modulePath, "module.exports.default = (fluxiq) => { fluxiq.__hostRegistered = 'default'; };\n");
    process.env.FLUXIQ_HOST_MODULE = modulePath;
    await loadFluxIQHostModule();
    const fluxiq = FluxIQ.create({ rootDir: root });

    expect(applyFluxIQHostModule(fluxiq)).toBe(fluxiq);
    expect((fluxiq as unknown as { __hostRegistered?: string }).__hostRegistered).toBe("default");

    rmSync(root, { recursive: true, force: true });
  });

  it("refuses to apply a configured host module that has not been loaded", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "fluxiq-host-module-"));
    const modulePath = path.join(root, "host-unloaded.cjs");
    writeFileSync(modulePath, "module.exports.registerFluxIQHost = (fluxiq) => fluxiq;\n");
    process.env.FLUXIQ_HOST_MODULE = modulePath;

    expect(() => applyFluxIQHostModule(FluxIQ.create({ rootDir: root }))).toThrow("FLUXIQ_HOST_MODULE has not been loaded");

    rmSync(root, { recursive: true, force: true });
  });

  it("loads an ES module host that imports FluxIQ's public package exports", async () => {
    const root = mkdtempSync(path.join(importingRepositoryDir(), "fluxiq-esm-host-"));
    const modulePath = path.join(root, "host.mjs");
    writeFileSync(modulePath, [
      "import { AutomationStudioNativeNodeRuntime } from \"fluxiq/automation-studio\";",
      "export function registerFluxIQHost(fluxiq) {",
      "  fluxiq.programs.automationStudio.bindNativeNodeRuntime(new AutomationStudioNativeNodeRuntime());",
      "  return fluxiq;",
      "}",
      ""
    ].join("\n"));
    process.env.FLUXIQ_HOST_MODULE = modulePath;
    try {
      await loadFluxIQHostModule();
      const fluxiq = applyFluxIQHostModule(FluxIQ.create({ rootDir: root }));

      expect(fluxiq.programs.automationStudio.nativeRuntimeSummary().bound).toBe(true);
      await fluxiq.close();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("explains that a CommonJS host cannot require FluxIQ's ESM-only package exports", async () => {
    const root = mkdtempSync(path.join(importingRepositoryDir(), "fluxiq-cjs-host-"));
    const modulePath = path.join(root, "host.cjs");
    writeFileSync(modulePath, "require(\"fluxiq/automation-studio\");\nmodule.exports.registerFluxIQHost = (fluxiq) => fluxiq;\n");
    process.env.FLUXIQ_HOST_MODULE = modulePath;
    try {
      await expect(loadFluxIQHostModule()).rejects.toThrow("FluxIQ packages are ESM-only");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("uses the sole host-registered domain without relocating global web state", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "fluxiq-domain-host-"));
    const modulePath = path.join(root, "host-domain.cjs");
    writeFileSync(modulePath, `
module.exports.registerFluxIQHost = (fluxiq) => {
  fluxiq.registerDomain({
    manifest: {
      id: 'example.domain',
      title: 'Example Domain',
      category: 'Tests',
      description: 'Domain registered by host.',
      icon: 'blocks'
    }
  });
};
`);
    process.env.FLUXIQ_IMPORTER_ROOT = root;
    process.env.FLUXIQ_HOST_MODULE = modulePath;
    delete process.env.FLUXIQ_DOMAIN_ID;
    delete process.env.FLUXIQ_HOST_DOMAIN;

    await loadFluxIQHostModule();
    const fluxiq = createFluxIQWebInstance();

    expect(fluxiq.activeDomainId).toBe("example.domain");
    expect(fluxiq.paths.data).toBe(path.join(root, ".fluxiq"));
    expect(fluxiq.paths.domainRoot).toBe(path.join(root, ".fluxiq", "domains", "example.domain"));
    expect(fluxiq.paths.domainPrograms).toBe(path.join(root, "domains", "example.domain", "programs"));

    rmSync(root, { recursive: true, force: true });
  });
});

describe("FluxIQ web runtime lifecycle", () => {
  it("serializes fresh storage initialization before the web runtime is used", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "fluxiq-web-initialize-"));
    process.env.FLUXIQ_IMPORTER_ROOT = root;
    process.env.FLUXIQ_CLIENT_GATEWAY_ENABLED = "false";
    const globalState = globalThis as typeof globalThis & { __fluxiqWebRuntime?: unknown };
    delete globalState.__fluxiqWebRuntime;
    try {
      const [first, second] = await Promise.all([
        initializeFluxIQWebRuntime(),
        initializeFluxIQWebRuntime(),
      ]);
      const config = JSON.parse(readFileSync(path.join(root, ".fluxiq", "config.json"), "utf8")) as { version?: unknown; layoutVersion?: unknown };

      expect(second).toBe(first);
      expect(config).toMatchObject({ version: 2, layoutVersion: 2 });
      expect(first.inspectStorage().layout).toBe("v2");
    } finally {
      await closeFluxIQWebRuntime();
      delete globalState.__fluxiqWebRuntime;
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each([
    { label: "legacy", journal: false, expected: "v1" },
    { label: "incomplete migration", journal: true, expected: "migration_incomplete" },
  ])("refuses $label storage without mutating it", async ({ journal, expected }) => {
    const root = mkdtempSync(path.join(os.tmpdir(), "fluxiq-web-refuse-"));
    const fluxiqRoot = path.join(root, ".fluxiq");
    const sentinel = path.join(fluxiqRoot, "data", "sentinel.txt");
    mkdirSync(path.dirname(sentinel), { recursive: true });
    writeFileSync(sentinel, "preserve", "utf8");
    if (journal) {
      const journalPath = path.join(fluxiqRoot, ".migration", "v2", "journal.json");
      mkdirSync(path.dirname(journalPath), { recursive: true });
      writeFileSync(journalPath, JSON.stringify({ version: 1, stage: "inventory" }), "utf8");
    }
    process.env.FLUXIQ_IMPORTER_ROOT = root;
    process.env.FLUXIQ_CLIENT_GATEWAY_ENABLED = "false";
    const globalState = globalThis as typeof globalThis & { __fluxiqWebRuntime?: unknown };
    delete globalState.__fluxiqWebRuntime;
    try {
      await expect(initializeFluxIQWebRuntime()).rejects.toThrow(`found ${expected}`);
      expect(readFileSync(sentinel, "utf8")).toBe("preserve");
      expect(existsSync(path.join(fluxiqRoot, "config.json"))).toBe(false);
      expect(existsSync(path.join(fluxiqRoot, "global.sqlite"))).toBe(false);
    } finally {
      await closeFluxIQWebRuntime();
      delete globalState.__fluxiqWebRuntime;
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("closes the previous instance on reload and the active instance on owner shutdown", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "fluxiq-web-lifecycle-"));
    process.env.FLUXIQ_IMPORTER_ROOT = root;
    process.env.FLUXIQ_CLIENT_GATEWAY_ENABLED = "false";
    const globalState = globalThis as typeof globalThis & { __fluxiqWebRuntime?: unknown };
    delete globalState.__fluxiqWebRuntime;
    const sigintListeners = process.listenerCount("SIGINT");
    const sigtermListeners = process.listenerCount("SIGTERM");
    try {
      const first = getFluxIQ();
      expect(process.listenerCount("SIGINT")).toBe(sigintListeners + 1);
      expect(process.listenerCount("SIGTERM")).toBe(sigtermListeners + 1);
      let firstCloseCount = 0;
      (first as any).close = async () => { firstCloseCount += 1; };
      const second = await reloadFluxIQWebInstance();
      expect(firstCloseCount).toBe(1);

      let secondCloseCount = 0;
      (second as any).close = async () => { secondCloseCount += 1; };
      await Promise.all([closeFluxIQWebRuntime(), closeFluxIQWebRuntime()]);
      expect(secondCloseCount).toBe(1);
      expect(process.listenerCount("SIGINT")).toBe(sigintListeners);
      expect(process.listenerCount("SIGTERM")).toBe(sigtermListeners);
    } finally {
      await closeFluxIQWebRuntime();
      delete globalState.__fluxiqWebRuntime;
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("lets the real web host module bind explicit reusable-context protection", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "fluxiq-reusable-host-"));
    const modulePath = path.join(root, "host-reusable.cjs");
    writeFileSync(modulePath, `
module.exports.registerFluxIQHost = (fluxiq) => fluxiq.bindAutomationStudioReusableLlmContext({
  enabled: true,
  contentProtection: {
    providerId: 'host.test-protection.v1',
    seal: async ({ content }) => ({ content, encryption: '{"provider":"test"}' }),
    open: async ({ content }) => content
  },
  selectForFreshEvidence: async () => undefined
});
`);
    process.env.FLUXIQ_IMPORTER_ROOT = root;
    process.env.FLUXIQ_HOST_MODULE = modulePath;
    process.env.FLUXIQ_CLIENT_GATEWAY_ENABLED = "false";
    await loadFluxIQHostModule();
    const fluxiq = createFluxIQWebInstance();
    expect(fluxiq.programs.automationStudio.reusableLlmContextStatus()).toMatchObject({ enabled: true, writeEnabled: true, contentProtection: "host.test-protection.v1" });
    await fluxiq.close();
    rmSync(root, { recursive: true, force: true });
  });

  it("fails web runtime construction when host reusable-context configuration is malformed", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "fluxiq-reusable-host-invalid-"));
    const modulePath = path.join(root, "host-reusable-invalid.cjs");
    writeFileSync(modulePath, `module.exports.registerFluxIQHost = (fluxiq) => fluxiq.bindAutomationStudioReusableLlmContext({ enabled: true, contentProtection: { providerId: '' } });\n`);
    process.env.FLUXIQ_IMPORTER_ROOT = root;
    process.env.FLUXIQ_HOST_MODULE = modulePath;
    await loadFluxIQHostModule();
    expect(() => createFluxIQWebInstance()).toThrow("host configuration is invalid");
    rmSync(root, { recursive: true, force: true });
  });
});
describe("FluxIQ web host root resolution", () => {
  it("prefers the explicit importer root", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "fluxiq-importer-root-"));
    process.env.FLUXIQ_IMPORTER_ROOT = root;

    expect(resolveFluxIQWebHostRoot(process.cwd())).toBe(path.resolve(root));

    rmSync(root, { recursive: true, force: true });
  });

  it("refuses to use a FluxIQ source checkout as implicit host storage", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "fluxiq-source-root-"));
    mkdirSync(path.join(root, "packages", "fluxiq", "src", "framework"), { recursive: true });
    mkdirSync(path.join(root, "apps", "web"), { recursive: true });
    writeFileSync(path.join(root, "pnpm-workspace.yaml"), "packages: []\n");
    writeFileSync(path.join(root, "packages", "fluxiq", "src", "framework", "index.ts"), "");
    writeFileSync(path.join(root, "apps", "web", "package.json"), "{}\n");
    delete process.env.FLUXIQ_IMPORTER_ROOT;
    delete process.env.FLUXIQ_HOST_ROOT;
    delete process.env.FLUXIQ_ROOT;
    delete process.env.FLUXIQ_ALLOW_FRAMEWORK_REPO_ROOT;

    expect(() => resolveFluxIQWebHostRoot(root)).toThrow("Refusing to use the FluxIQ framework source checkout");

    rmSync(root, { recursive: true, force: true });
  });
});


describe("web model-provider construction admission", () => {
  it.each(["false", "true", undefined])("forwards admission %j through inferred-domain second creation and reload", async (admission) => {
    const root = mkdtempSync(path.join(os.tmpdir(), "fluxiq-web-provider-admission-"));
    const host = path.join(root, "host.cjs");
    writeFileSync(host, "module.exports.registerFluxIQHost = (fluxiq) => { fluxiq.registerDomain({manifest:{id:'admission.example',title:'Example',category:'Tests',description:'Example',icon:'blocks'}}); };\n");
    process.env.FLUXIQ_IMPORTER_ROOT = root; process.env.FLUXIQ_HOST_MODULE = host;
    process.env.FLUXIQ_CLIENT_GATEWAY_ENABLED = "false";
    if (admission === undefined) delete process.env.FLUXIQ_MODEL_PROVIDERS_ENABLED;
    else process.env.FLUXIQ_MODEL_PROVIDERS_ENABLED = admission;
    delete process.env.FLUXIQ_DOMAIN_ID; delete process.env.FLUXIQ_HOST_DOMAIN;
    const globalState = globalThis as typeof globalThis & { __fluxiqWebRuntime?: unknown };
    delete globalState.__fluxiqWebRuntime;
    const create = vi.spyOn(FluxIQ, "create").mockImplementation((options) => ({
      activeDomainId: options?.domainId, domains: { summaries: () => [{ id: "admission.example" }] },
      registerDomain() { return this; }, inspectStorage: () => ({ layout: "v2" }), close: vi.fn(async () => {}),
      programs: { automationStudioClientGateway: { setClientRecordingContextProvider: vi.fn() } }
    }) as unknown as FluxIQ);
    try {
      await initializeFluxIQWebRuntime();
      await reloadFluxIQWebInstance();
      expect(create).toHaveBeenCalledTimes(4);
      expect(create.mock.calls.map(([options]) => options?.modelProvidersEnabled)).toEqual(Array(4).fill(admission !== "false"));
      expect(create.mock.calls.filter(([options]) => options?.domainId === "admission.example")).toHaveLength(2);
      const prior = getFluxIQ();
      process.env.FLUXIQ_MODEL_PROVIDERS_ENABLED = "off";
      const close = vi.spyOn(prior, "close");
      await expect(reloadFluxIQWebInstance()).rejects.toThrow("FLUXIQ_MODEL_PROVIDERS_ENABLED");
      expect(create).toHaveBeenCalledTimes(4);
      expect(close).not.toHaveBeenCalled();
    } finally {
      await closeFluxIQWebRuntime(); for (const result of create.mock.results) if (result.type === "return") await result.value.close(); create.mockRestore(); delete globalState.__fluxiqWebRuntime;
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("invalid explicit activation refuses before any FluxIQ construction", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "fluxiq-web-admission-invalid-")); process.env.FLUXIQ_IMPORTER_ROOT = root; process.env.FLUXIQ_MODEL_PROVIDERS_ENABLED = "off";
    const create = vi.spyOn(FluxIQ, "create");
    try { expect(() => createFluxIQWebInstance()).toThrow("FLUXIQ_MODEL_PROVIDERS_ENABLED"); expect(create).not.toHaveBeenCalled(); }
    finally { for (const result of create.mock.results) if (result.type === "return") await result.value.close(); create.mockRestore(); rmSync(root, { recursive: true, force: true }); }
  });
});

describe("FluxIQ hosted runtime wiring", () => {
  const globalState = globalThis as typeof globalThis & { __fluxiqWebRuntime?: unknown };

  async function freePort(): Promise<number> {
    const { createServer } = await import("node:net");
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as { port: number };
    await new Promise((resolve) => server.close(resolve));
    return port;
  }

  async function hostedEnv(profile: string | undefined, extra: Record<string, string> = {}): Promise<{ root: string; listen: string }> {
    const root = mkdtempSync(path.join(os.tmpdir(), "fluxiq-web-hosted-"));
    const tokenFile = path.join(root, "provisioning-token");
    writeFileSync(tokenFile, `${"t".repeat(48)}\n`, { mode: 0o600 });
    const listen = `127.0.0.1:${await freePort()}`;
    process.env.FLUXIQ_IMPORTER_ROOT = root;
    process.env.FLUXIQ_CLIENT_GATEWAY_ENABLED = "false";
    process.env.FLUXIQ_PROVISIONING_TOKEN_FILE = tokenFile;
    process.env.FLUXIQ_PROVISIONING_LISTEN = listen;
    process.env.FLUXIQ_PUBLIC_ORIGIN = "https://panel.example.test";
    if (profile === undefined) delete process.env.FLUXIQ_PROFILE;
    else process.env.FLUXIQ_PROFILE = profile;
    for (const [key, value] of Object.entries(extra)) process.env[key] = value;
    delete globalState.__fluxiqWebRuntime;
    ownerClaim.prepare.mockClear();
    return { root, listen };
  }

  async function reachable(listen: string): Promise<boolean> {
    const { connect } = await import("node:net");
    const [host, port] = listen.split(":");
    return new Promise((resolve) => {
      const socket = connect({ host, port: Number(port) }, () => {
        socket.destroy();
        resolve(true);
      });
      socket.on("error", () => resolve(false));
    });
  }

  async function cleanup(root: string): Promise<void> {
    await closeFluxIQWebRuntime();
    delete globalState.__fluxiqWebRuntime;
    rmSync(root, { recursive: true, force: true });
  }

  it("starts the provisioning listener on the service profile and closes it first on shutdown", async () => {
    const { root, listen } = await hostedEnv("service");
    try {
      await initializeFluxIQWebRuntime();
      expect(await reachable(listen)).toBe(true);
      await closeFluxIQWebRuntime();
      expect(await reachable(listen)).toBe(false);
    } finally {
      await cleanup(root);
    }
  });

  it.each([undefined, "local", "self-hosted"])("does not start the listener under profile %j", async (profile) => {
    const { root, listen } = await hostedEnv(profile);
    try {
      await initializeFluxIQWebRuntime();
      expect(await reachable(listen)).toBe(false);
    } finally {
      await cleanup(root);
    }
  });

  it("refuses a public bind: the service profile fails to start on the panel's port", async () => {
    const { root } = await hostedEnv("service", { FLUXIQ_PROVISIONING_LISTEN: "0.0.0.0:3000" });
    try {
      await expect(initializeFluxIQWebRuntime()).rejects.toThrow(/may not use port 3000/u);
    } finally {
      await cleanup(root);
    }
  });

  it("prepares the owner claim off the local profile only, and logs where the code is, never the code", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const local = await hostedEnv("local");
    try {
      await initializeFluxIQWebRuntime();
      expect(ownerClaim.prepare).not.toHaveBeenCalled();
    } finally {
      await cleanup(local.root);
    }
    const hosted = await hostedEnv("self-hosted");
    try {
      await initializeFluxIQWebRuntime();
      expect(ownerClaim.prepare).toHaveBeenCalledTimes(1);
      expect(ownerClaim.prepare.mock.calls[0]![0]).toMatchObject({ settings: { profile: "self-hosted" }, fluxiqDir: path.join(hosted.root, ".fluxiq") });
      const lines = info.mock.calls.map((call) => String(call[0]));
      expect(lines.some((line) => line.includes("/setup-code-file") && line.includes("https://panel.example.test/setup"))).toBe(true);
    } finally {
      info.mockRestore();
      await cleanup(hosted.root);
    }
  });

  it("keys the status off FLUXIQ_PROFILE: host paths only outside the service profile", async () => {
    for (const [profile, hostPaths] of [["local", true], ["service", false]] as const) {
      const { root } = await hostedEnv(profile, { FLUXIQ_PROVISIONING_LISTEN: "", FLUXIQ_PROVISIONING_TOKEN_FILE: "" });
      try {
        await initializeFluxIQWebRuntime();
        const status = getFluxIQWebRuntimeStatus() as Record<string, unknown>;
        expect("hostRoot" in status).toBe(hostPaths);
        expect("fluxiqDir" in status).toBe(hostPaths);
        expect(status.clientGatewayPublicUrl).toBe(profile === "service" ? "wss://panel.example.test/client" : "ws://127.0.0.1:4777/client");
      } finally {
        await cleanup(root);
      }
    }
  });

  it("is ready once initialized and not before", async () => {
    const { root } = await hostedEnv("local");
    try {
      expect(getFluxIQWebReadiness()).toEqual({ ready: false, reason: "starting" });
      await initializeFluxIQWebRuntime();
      expect(getFluxIQWebReadiness()).toEqual({ ready: true });
    } finally {
      await cleanup(root);
    }
  });

  it("persists gateway security events under the service profile and not under local", async () => {
    for (const [profile, persisted] of [["local", false], ["service", true]] as const) {
      const { root } = await hostedEnv(profile, { FLUXIQ_PROVISIONING_LISTEN: "", FLUXIQ_PROVISIONING_TOKEN_FILE: "" });
      try {
        const fluxiq = await initializeFluxIQWebRuntime();
        fluxiq.programs.clientGateway.recordTransportEvent("transport.origin_refused", "Origin refused.");
        expect(existsSync(path.join(root, ".fluxiq", "security", "gateway-audit.jsonl"))).toBe(persisted);
      } finally {
        await cleanup(root);
      }
    }
  });

  it("on SIGTERM with drainSeconds above 0 drains the gateway, then closes and exits 143; with the local default of 0 it closes at once", async () => {
    const { drainState } = await import("../../server/drain");
    for (const seconds of ["2", undefined]) {
      const { root } = await hostedEnv("local", seconds === undefined ? {} : { FLUXIQ_DRAIN_SECONDS: seconds });
      const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as typeof process.exit);
      try {
        await initializeFluxIQWebRuntime();
        const state = globalState.__fluxiqWebRuntime as { clientGatewayServer: unknown; shutdownHandlers: { sigterm: () => void } };
        let open = 2;
        const beginDrain = vi.fn();
        state.clientGatewayServer = { status: { listening: true }, close: async () => {}, beginDrain, openConnectionCount: () => open };
        state.shutdownHandlers.sigterm();
        if (seconds === "2") {
          await vi.waitFor(() => expect(beginDrain).toHaveBeenCalledWith({ retryAfterMs: 2000, reason: "shutdown" }));
          expect(drainState.isDraining()).toBe(true);
          expect(getFluxIQWebReadiness()).toEqual({ ready: false, reason: "draining" });
          expect(exit).not.toHaveBeenCalled();
          open = 0;
        } else {
          expect(beginDrain).not.toHaveBeenCalled();
        }
        await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(143), { timeout: 5000 });
      } finally {
        exit.mockRestore();
        drainState.reset();
        delete process.env.FLUXIQ_DRAIN_SECONDS;
        await cleanup(root);
      }
    }
  });
});
