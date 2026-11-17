import { ProjectsPage } from "../../../features/projects";
import { requirePanelScreen } from "../../product";

export default function ProjectsRoute() {
  requirePanelScreen("projects");
  return <ProjectsPage />;
}
