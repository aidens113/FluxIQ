import { RunsListPage } from "../../../features/runs";
import { requirePanelScreen } from "../../product";

export default function RunsPage() {
  requirePanelScreen("runs");
  return <RunsListPage />;
}
