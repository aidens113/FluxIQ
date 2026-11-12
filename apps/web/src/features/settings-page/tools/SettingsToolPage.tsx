"use client";

import { PublishPanelPage } from "../../panel-shell";
import type { CurrentUser } from "../../programs/types";
import { TechnicalDetails } from "../../programs/technical-details";
import type { EngineTool } from "../model";
import { SettingsToolView } from "./SettingsToolView";
import "./settings-tool.css";

/** One engine tool as a Settings sub-page: its name, what it is for, its technical details, and its view. */
export function SettingsToolPage({ tool, user }: { tool: EngineTool; user: CurrentUser }) {
  return (
    <div className="settings-tool">
      <PublishPanelPage page="settings" />
      <a className="settings-tool-back" href="/settings">Settings</a>
      <h1>{tool.name}</h1>
      <p className="settings-tool-note">{tool.explanation}</p>
      <div className="settings-tool-actions"><TechnicalDetails toolId={tool.id} title={tool.name} /></div>
      <SettingsToolView toolId={tool.id} user={user} />
    </div>
  );
}
