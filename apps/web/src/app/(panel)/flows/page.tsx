import { FlowsListPage } from "../../../features/flows";
import { requirePanelScreen } from "../../product";

export default function FlowsPage() {
  requirePanelScreen("flows");
  return <FlowsListPage />;
}
