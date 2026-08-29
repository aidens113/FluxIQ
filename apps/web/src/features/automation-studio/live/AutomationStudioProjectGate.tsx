"use client";

import { FolderOpen } from "lucide-react";
import type { ComponentProps } from "react";
import { AutomationProjectCatalogSurface } from "../project";

export type AutomationStudioProjectGateProps =
  ComponentProps<typeof AutomationProjectCatalogSurface> & {
    state: "restoring" | "catalog";
  };

export function AutomationStudioProjectGate(props: AutomationStudioProjectGateProps) {
  const { state, ...catalogProps } = props;
  const restoring = state === "restoring";

  return (
    <section
      aria-label={restoring ? "Opening Automation Studio project" : "Automation Studio project selection"}
      className="automation-studio-shell project-required"
    >
      <div className="automation-project-required">
        <header className="automation-studio-workbar">
          <div className="automation-workspace-actions">
            <strong>Automation Studio</strong>
            <span aria-live={restoring ? "polite" : undefined}>
              {restoring ? "Opening project" : "Choose a project"}
            </span>
          </div>
        </header>
        <main aria-busy={restoring || undefined} className="automation-project-gate">
          {restoring ? (
            <section aria-labelledby="automation-project-restoring-title" className="automation-project-browser">
              <FolderOpen aria-hidden size={34} />
              <div>
                <strong id="automation-project-restoring-title">Opening project...</strong>
                <span>Restoring the project from the current URL.</span>
              </div>
            </section>
          ) : (
            <AutomationProjectCatalogSurface {...catalogProps} />
          )}
        </main>
      </div>
    </section>
  );
}