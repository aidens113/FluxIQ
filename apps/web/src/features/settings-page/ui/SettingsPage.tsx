"use client";

import { useState } from "react";
import { usePanelModelKeys } from "../../model-keys";
import { PublishPanelPage } from "../../panel-shell";
import { useSettingsData, useSettingsPort, useWorkspaceHasOthers } from "../data";
import { AiKeysSection } from "./AiKeysSection";
import { AppearanceSection } from "../appearance";
import { StartingHumannessSection } from "../humanness";
import { AllowanceSection } from "./AllowanceSection";
import type { EngineTool } from "../model";
import { AssistantModelSection } from "./AssistantModelSection";
import { EngineToolsSection } from "./EngineToolsSection";
import "./settings-page.css";

/** `engineTools`: the Advanced tools the deployment's panel preset lists; `mayChooseForWorkspace`: whether the signed-in role may set the workspace's default and assistant key. The route passes both from the server. */
export function SettingsPage(props: { engineTools?: readonly EngineTool[]; mayChooseForWorkspace?: boolean }) {
  const port = useSettingsPort();
  const modelKeys = usePanelModelKeys();
  const sharing = useWorkspaceHasOthers();
  const data = useSettingsData(port, { mayChooseForWorkspace: props.mayChooseForWorkspace });
  const [selectedId, setSelectedId] = useState("");
  const selected = data.keys.some((key) => key.id === selectedId) ? selectedId : "";
  return (
    <div className="settings-page">
      <PublishPanelPage page="settings" selection={selected ? { keyId: selected } : {}} />
      <h1>Settings</h1>
      {data.loadError ? <p role="alert">{data.loadError}</p> : null}
      <AiKeysSection data={data} port={modelKeys} sharing={sharing} selectedId={selected} onSelect={setSelectedId} />
      {data.loadError ? null : data.loading ? (
        // The two sections that wait for the keys keep their room, so what is below them does not jump when they arrive.
        <div className="settings-reserve" role="status" aria-busy="true">Loading your settings…</div>
      ) : (
        <>
          <AssistantModelSection data={data} />
          <AllowanceSection data={data} />
        </>
      )}
      <section aria-labelledby="settings-connect">
        <h2 id="settings-connect">Connect a browser or app</h2>
        <p>Connecting and approving browsers and apps is under <a href="/security/devices">Security, Devices and apps</a>.</p>
      </section>
      <StartingHumannessSection port={port} />
      <AppearanceSection />
      <EngineToolsSection {...(props.engineTools ? { tools: props.engineTools } : {})} />
    </div>
  );
}
