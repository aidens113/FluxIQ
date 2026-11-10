"use client";

import type { EngineStatus } from "../../panel-shell";
import type { Resource } from "../data";
import { HomeSection } from "./HomeSection";

export function HomeEngine(props: { engine: Resource<EngineStatus> }) {
  return (
    <HomeSection
      id="engine"
      title="Engine"
      resource={props.engine}
      errorText="Could not reach the engine."
      emptyText=""
      isEmpty={() => false}
      render={(status) => (
        <p className="home-fact" data-tone={status.tone}>
          <span className="home-dot" aria-hidden="true" />
          {status.tone === "ok" ? "Running" : status.tone === "warn" ? "Not ready yet" : "Could not tell whether the engine is running"}
        </p>
      )}
    />
  );
}
