import type { PanelPage } from "../../../features/panel-shell/context";

/** A named selection of what a deployment's panel shows. A preset only hides; it never grants anything IAM refuses. */
export type PanelPreset = {
  id: string;
  /** The screens listed in the nav and served by their routes, in nav order. */
  pages: readonly PanelPage[];
  /** The Settings tool ids listed under Settings and served at `/settings/<id>`. */
  settingsTools: readonly string[];
};

/** Screens no preset may hide: an administrator must always be able to reach the sign-in, keys and settings. */
export const ALWAYS_REACHABLE_PAGES: readonly PanelPage[] = Object.freeze(["home", "security", "settings"] as const);

export const DEFAULT_PANEL_PRESET_ID = "full";

export const PANEL_PRESETS: Readonly<Record<string, PanelPreset>> = Object.freeze({
  full: {
    id: "full",
    pages: ["home", "flows", "runs", "data", "security", "settings"],
    settingsTools: ["background-tasks", "deployment-sync", "database-manager", "docs", "runtime", "compute-control", "production-runner"]
  },
  "data-collection": {
    id: "data-collection",
    pages: ["home", "flows", "runs", "data", "security", "settings"],
    settingsTools: ["docs", "runtime"]
  },
  "task-automation": {
    id: "task-automation",
    pages: ["home", "flows", "runs", "security", "settings"],
    settingsTools: ["background-tasks", "production-runner", "docs", "runtime"]
  }
});
