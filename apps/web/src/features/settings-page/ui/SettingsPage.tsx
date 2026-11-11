"use client";

import { useState } from "react";
import { PublishPanelPage } from "../../panel-shell";
import { useSettingsData, useSettingsPort } from "../data";
import { AiKeysSection } from "./AiKeysSection";
import { AppearanceSection } from "../appearance";
import { AllowanceSection } from "./AllowanceSection";
import type { EngineTool } from "../model";
import { AssistantModelSection } from "./AssistantModelSection";
import { EngineToolsSection } from "./EngineToolsSection";
import "./settings-page.css";

/** `engineTools`: the Advanced tools the deployment's panel preset lists; the route passes them from the server. */
export function SettingsPage(props: { engineTools?: readonly EngineTool[] }) {
  const data = useSettingsData(useSettingsPort());
  const [selectedId, setSelectedId] = useState("");
  const selected = data.keys.some((key) => key.id === selectedId) ? selectedId : "";
  return (
    <div className="settings-page">
      <PublishPanelPage page="settings" selection={selected ? { keyId: selected } : {}} />
      <h1>Settings</h1>
      {data.loading ? <p role="status">Loading your settings...</p> : null}
      {data.loadError ? <p role="alert">{data.loadError}</p> : null}
      {data.loading || data.loadError ? null : (
        <>
          <AiKeysSection data={data} selectedId={selected} onSelect={setSelectedId} />
          <AssistantModelSection data={data} />
          <AllowanceSection data={data} />
        </>
      )}
      <AppearanceSection />
      <EngineToolsSection {...(props.engineTools ? { tools: props.engineTools } : {})} />
    </div>
  );
}
