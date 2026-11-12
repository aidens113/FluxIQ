/** What each engine tool exposes underneath: its endpoints, what it stores, and the runtime parts it uses. */
export type ToolCapabilities = {
  api: readonly string[];
  storage: readonly string[];
  runtime: readonly string[];
};

/** The inventories the retired program pages showed under Technical details, by program id. */
export const TOOL_CAPABILITIES: Readonly<Record<string, ToolCapabilities>> = {
  "background-tasks": {
    api: ["snapshot", "run", "set-enabled"],
    storage: ["Task definitions", "Run history"],
    runtime: ["Task registry", "Task handlers"]
  },
  "compute-control": {
    api: ["snapshot", "command"],
    storage: ["Node inventory", "Commands", "Leases"],
    runtime: ["Heartbeats", "Lease coordination"]
  },
  "database-manager": {
    api: ["snapshot"],
    storage: ["File repositories", "Scoped records"],
    runtime: ["Repository registry", "Migration registry"]
  },
  "deployment-sync": {
    api: ["snapshot", "sync"],
    storage: ["Targets", "Artifacts", "Run history"],
    runtime: ["Sync adapter", "Run coordinator"]
  },
  docs: {
    api: ["snapshot"],
    storage: ["Sources", "Page index"],
    runtime: ["Markdown scanner", "Docs inventory"]
  },
  "identity-access": {
    api: ["snapshot"],
    storage: ["Users", "Roles", "Sessions", "Vault status"],
    runtime: ["Role registry", "Session lifecycle"]
  },
  "secret-keys": {
    api: ["snapshot", "create-key", "update-key", "rotate-key", "reveal-key", "delete-key"],
    storage: ["Encrypted key records", "Redacted metadata", "Reveal audit timestamps"],
    runtime: ["Credential recheck", "AES-256-GCM sealing", "Secret resolver"]
  },
  "production-runner": {
    api: ["snapshot", "start", "stop"],
    storage: ["Run records"],
    runtime: ["Dispatcher", "Run lifecycle"]
  }
};

/** A tool with no inventory of its own shows the generic one the program page fell back to. */
export const DEFAULT_CAPABILITIES: ToolCapabilities = {
  api: ["snapshot"],
  storage: ["Program records"],
  runtime: ["Program service"]
};
