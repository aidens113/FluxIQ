"use client";

// The top bar's project choice: `@fluxiq/ui-components`' switcher (the one the extension uses), made
// once into a host element and told which project is open. React does not render it, it only places it.
// The list comes from the shell's one projects source, so the dock and this sheet read the same answer.

import "@fluxiq/ui-components/styles/chat.css";
import { createProjectSwitcher, type ProjectSwitcher as SwitcherHandle } from "@fluxiq/ui-components";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { createAutomationProject } from "../../automation-studio/project";
import { useProgramTransport } from "../../automation-studio/data/use-program-transport";
import { usePanelContext } from "../context";
import { notifyProjectsChanged, createProjectsPort, projectsSource } from "./projects";
import { useProjectChoices } from "./use-project-choices";

export function ProjectSwitcher() {
  const { context, dispatch } = usePanelContext();
  const { projects } = useProjectChoices();
  const studio = useProgramTransport("automation-studio");
  const router = useRouter();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const handle = useRef<SwitcherHandle | null>(null);
  const latest = useRef({ studio, dispatch, router });
  latest.current = { studio, dispatch, router };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const port = createProjectsPort(
      projectsSource,
      async (name) => {
        const result = await createAutomationProject(latest.current.studio, { name, description: "", categoryId: null, authorizationPin: "" });
        const project = result.ok ? result.payload?.project : undefined;
        if (!project) throw new Error(result.error ?? "The project could not be created.");
        return { id: project.id, name: project.name };
      },
      notifyProjectsChanged
    );
    const switcher = createProjectSwitcher({
      port,
      onSelect: (project) => latest.current.dispatch({ type: "project", projectId: project.id }),
      onOpenAll: () => {
        latest.current.dispatch({ type: "project", projectId: undefined });
        latest.current.router.push("/projects");
      }
    });
    handle.current = switcher;
    host.append(switcher.element);
    return () => {
      switcher.destroy();
      switcher.element.remove();
      handle.current = null;
    };
  }, []);

  const projectId = context.projectId;
  const name = projects.find((project) => project.id === projectId)?.name;
  useEffect(() => {
    handle.current?.setCurrent(projectId ? { id: projectId, name: name ?? "Project" } : null);
  }, [projectId, name]);

  return <div className="panel-project" ref={hostRef} data-testid="panel-project-switcher" />;
}
