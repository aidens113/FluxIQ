import type { PanelPage, PanelSelection } from "./types";

export type PanelContextAction =
  /** A page opened, or changed what it has picked: its selection replaces the last one. */
  | { type: "publish"; page: PanelPage; selection?: PanelSelection }
  /** The person chose a project in the top bar (or none): what was picked in another project is dropped. */
  | { type: "project"; projectId: string | undefined };
