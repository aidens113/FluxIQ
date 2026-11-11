import { DataPage } from "../../../features/data";
import { requirePanelScreen } from "../../product";

export default function Page() {
  requirePanelScreen("data");
  return <DataPage />;
}
